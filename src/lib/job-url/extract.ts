/**
 * Pure helpers that turn a job posting page's HTML into facts we can trust.
 *
 * Most job boards and applicant-tracking systems (LinkedIn, Indeed, Greenhouse,
 * Lever, Workable, JobStreet…) embed a schema.org JobPosting in JSON-LD for
 * Google Jobs. Those values come from the employer, so they are used as-is and
 * win over anything the AI infers. The readable page text is kept for the AI to
 * fill in what the markup does not cover.
 */

export type WorkArrangement = "remote" | "hybrid" | "onsite";
export type ExtractedEmployment = "full_time" | "part_time" | "contract" | "freelance";
export type ExtractedRateType = "hourly" | "daily" | "weekly" | "monthly" | "annual";

export interface StructuredJob {
  title: string | null;
  company: string | null;
  location: string | null;
  work_arrangement: WorkArrangement | null;
  employment_type: ExtractedEmployment | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  rate_type: ExtractedRateType | null;
  description: string | null;
  skills: string[];
  qualifications: string[];
  application_url: string | null;
}

export interface ExtractedPage {
  pageTitle: string | null;
  metaDescription: string | null;
  /** JobPosting markup, when the page has it. */
  structured: StructuredJob | null;
  /** Readable text of the page body. */
  text: string;
}

// ---------------------------------------------------------------- text

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  bull: "•",
  middot: "·",
  peso: "₱",
  euro: "€",
  pound: "£",
  copy: "©",
  reg: "®",
  trade: "™",
  zwnj: "",
  zwj: "",
  shy: "",
};

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** HTML fragment → readable plain text with paragraph and list breaks kept. */
export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<\/(p|div|section|article|tr|li|ul|ol|h[1-6]|header|footer)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The page's main content as text, without navigation, headers and footers. */
export function pageText(html: string) {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const cleaned = body.replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ");
  const main =
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(cleaned)?.[1] ??
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(cleaned)?.[1];
  const mainText = main ? htmlToText(main) : "";
  // Some sites put only a header in <main>; fall back to the whole body then.
  return mainText.length >= 400 ? mainText : htmlToText(cleaned);
}

function meta(html: string, name: string) {
  const re = new RegExp(`<meta\\b[^>]*(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  const content = tag ? /content=["']([^"']*)["']/i.exec(tag)?.[1] : undefined;
  return content ? decodeEntities(content).trim() || null : null;
}

// ---------------------------------------------------------------- JSON-LD

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const asArray = <T>(v: T | T[] | null | undefined): T[] =>
  v === null || v === undefined ? [] : Array.isArray(v) ? v : [v];

function str(v: Json | undefined): string | null {
  if (typeof v === "string") return decodeEntities(v).trim() || null;
  if (typeof v === "number") return String(v);
  if (isObj(v)) return str(v.name ?? v["@value"]);
  return null;
}

function num(v: Json | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function jsonLdBlocks(html: string): Obj[] {
  const out: Obj[] = [];
  const re =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const raw = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        // Some sites leave raw newlines inside strings.
        parsed = JSON.parse(raw.replace(/[\r\n\t]+/g, " "));
      } catch {
        continue;
      }
    }
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (isObj(v)) {
        out.push(v);
        if (v["@graph"]) walk(v["@graph"]);
      }
    };
    walk(parsed);
  }
  return out;
}

const EMPLOYMENT: Record<string, ExtractedEmployment> = {
  FULL_TIME: "full_time",
  FULLTIME: "full_time",
  PART_TIME: "part_time",
  PARTTIME: "part_time",
  CONTRACTOR: "contract",
  CONTRACT: "contract",
  TEMPORARY: "contract",
  FREELANCE: "freelance",
};

const UNIT: Record<string, ExtractedRateType> = {
  HOUR: "hourly",
  DAY: "daily",
  WEEK: "weekly",
  MONTH: "monthly",
  YEAR: "annual",
};

function placeName(loc: Json): string | null {
  if (typeof loc === "string") return str(loc);
  if (!isObj(loc)) return null;
  const addr = loc.address;
  if (typeof addr === "string") return str(addr);
  if (isObj(addr)) {
    const parts = [
      str(addr.addressLocality),
      str(addr.addressRegion),
      str(addr.addressCountry),
    ].filter((p, i, all): p is string => !!p && all.indexOf(p) === i);
    if (parts.length) return parts.join(", ");
  }
  return str(loc.name);
}

function list(v: Json | undefined): string[] {
  return asArray(v)
    .flatMap((item) => {
      const s = isObj(item)
        ? str(item.name ?? item.credentialCategory ?? item.description)
        : str(item);
      if (!s) return [];
      // Long HTML/text blocks: split into lines or bullets.
      const text = /<[a-z]/i.test(s) ? htmlToText(s) : s;
      return text
        .split(/\n|•|;\s/)
        .map((x) => x.replace(/^[-*·\s]+/, "").trim())
        .filter((x) => x.length > 1 && x.length < 300);
    })
    .filter((x, i, all) => all.indexOf(x) === i)
    .slice(0, 40);
}

export function structuredFromJsonLd(html: string): StructuredJob | null {
  const posting = jsonLdBlocks(html).find((o) =>
    asArray(o["@type"]).some((t) => t === "JobPosting"),
  );
  if (!posting) return null;

  const remote = asArray(posting.jobLocationType).some(
    (t) => typeof t === "string" && /TELECOMMUTE|REMOTE/i.test(t),
  );
  const places = asArray(posting.jobLocation)
    .map(placeName)
    .filter((p): p is string => !!p);
  const applicantRegions = asArray(posting.applicantLocationRequirements)
    .map((r) => str(r))
    .filter((p): p is string => !!p);
  const location =
    places[0] ?? (applicantRegions.length ? applicantRegions.join(", ") : null);

  const employment =
    asArray(posting.employmentType)
      .map((t) =>
        typeof t === "string"
          ? EMPLOYMENT[t.toUpperCase().replace(/[\s-]/g, "_")]
          : undefined,
      )
      .find(Boolean) ?? null;

  let salary_min: number | null = null;
  let salary_max: number | null = null;
  let currency: string | null = null;
  let rate_type: ExtractedRateType | null = null;
  const salary = asArray(posting.baseSalary ?? posting.estimatedSalary).find(isObj);
  if (salary) {
    currency = str(salary.currency)?.toUpperCase() ?? null;
    const value = salary.value;
    if (isObj(value)) {
      salary_min = num(value.minValue) ?? num(value.value);
      salary_max = num(value.maxValue);
      const unit = str(value.unitText)?.toUpperCase();
      rate_type = unit ? (UNIT[unit] ?? null) : null;
    } else {
      salary_min = num(value);
    }
    const unit = str(salary.unitText)?.toUpperCase();
    if (!rate_type && unit) rate_type = UNIT[unit] ?? null;
    if (salary_max !== null && salary_min === salary_max) salary_max = null;
  }

  const description = str(posting.description);
  const org = posting.hiringOrganization;
  const hasPay = salary_min !== null || salary_max !== null;

  return {
    title: str(posting.title),
    company: isObj(org) ? str(org.name) : str(org),
    location,
    work_arrangement: remote ? "remote" : null,
    employment_type: employment,
    salary_min,
    salary_max,
    currency: hasPay && currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    rate_type: hasPay ? rate_type : null,
    description: description ? htmlToText(description) : null,
    skills: list(posting.skills),
    qualifications: [
      ...list(posting.qualifications),
      ...list(posting.experienceRequirements),
      ...list(posting.educationRequirements),
    ].slice(0, 40),
    application_url: str(posting.url),
  };
}

export function extractJobPage(html: string): ExtractedPage {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return {
    pageTitle: meta(html, "og:title") ?? (title ? decodeEntities(title).trim() : null),
    metaDescription: meta(html, "og:description") ?? meta(html, "description"),
    structured: structuredFromJsonLd(html),
    text: pageText(html),
  };
}

// ---------------------------------------------------------------- URLs

const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)indeed\.[a-z.]+$/, "Indeed"],
  [/(^|\.)onlinejobs\.ph$/, "OnlineJobs.ph"],
  [/(^|\.)jobstreet\.[a-z.]+$/, "JobStreet"],
  [/(^|\.)upwork\.com$/, "Upwork"],
  [/(^|\.)glassdoor\.[a-z.]+$/, "Glassdoor"],
  [/(^|\.)kalibrr\.com$/, "Kalibrr"],
  [/(^|\.)wellfound\.com$/, "Wellfound"],
  [/(^|\.)greenhouse\.io$/, "Greenhouse"],
  [/(^|\.)lever\.co$/, "Lever"],
  [/(^|\.)workable\.com$/, "Workable"],
  [/(^|\.)ashbyhq\.com$/, "Ashby"],
  [/(^|\.)smartrecruiters\.com$/, "SmartRecruiters"],
  [/(^|\.)myworkdayjobs\.com$/, "Workday"],
  [/(^|\.)bamboohr\.com$/, "BambooHR"],
  [/(^|\.)weworkremotely\.com$/, "We Work Remotely"],
  [/(^|\.)remoteok\.com$/, "Remote OK"],
];

/** Friendly name of the job site a URL belongs to (or its host). */
export function platformFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return PLATFORMS.find(([re]) => re.test(host))?.[1] ?? host;
  } catch {
    return null;
  }
}

/** True when the input is a single http(s) URL and nothing else. */
export function looksLikeUrl(input: string) {
  const s = input.trim();
  if (!/^https?:\/\/\S+$/i.test(s)) return false;
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}
