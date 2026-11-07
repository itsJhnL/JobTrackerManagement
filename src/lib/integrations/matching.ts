/**
 * Deterministic matching of an incoming email to the user's applications.
 * Runs before (and double-checks after) the AI classification so an obvious
 * match never depends on the model, and an ambiguous one is never auto-linked.
 * Pure and unit tested.
 */

export interface MatchCandidate {
  id: string;
  company_name: string;
  job_title: string;
  /** Recruiter / contact emails already attached to the application. */
  contact_emails?: string[];
  /** Known sender domains for the company (from contacts or job URL). */
  domains?: string[];
}

export interface MatchInput {
  from_email: string | null;
  subject: string;
  text: string;
  /** Company / title the AI extracted, if any. */
  extracted?: { company: string | null; job_title: string | null };
}

export interface MatchResult {
  applicationId: string | null;
  confidence: number; // 0–1
  reason: string;
  /** Other plausible applications, for the manual-confirm UI. */
  alternatives: { id: string; score: number }[];
}

const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "linkedin.com",
  "indeed.com",
  "jobstreet.com",
  "onlinejobs.ph",
  "greenhouse.io",
  "lever.co",
  "workable.com",
  "ashbyhq.com",
  "smartrecruiters.com",
  "myworkday.com",
  "bamboohr.com",
]);

export function normalize(s: string | null | undefined) {
  return (s ?? "")
    .toLowerCase()
    .replace(
      /\b(inc|llc|ltd|limited|corp|corporation|co|company|pty|plc|gmbh|sa|the)\b\.?/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function emailDomain(email: string | null | undefined) {
  const m = /@([^\s>]+)>?$/.exec((email ?? "").trim().toLowerCase());
  return m?.[1] ?? null;
}

function tokens(s: string) {
  return new Set(
    normalize(s)
      .split(" ")
      .filter((t) => t.length > 2),
  );
}

export function matchEmailToApplication(
  input: MatchInput,
  candidates: MatchCandidate[],
): MatchResult {
  if (candidates.length === 0)
    return {
      applicationId: null,
      confidence: 0,
      reason: "No applications to match against",
      alternatives: [],
    };

  const from = (input.from_email ?? "").toLowerCase();
  const domain = emailDomain(from);
  const haystack = normalize(`${input.subject} ${input.text.slice(0, 4000)}`);
  const extractedCompany = normalize(input.extracted?.company);
  const extractedTitle = normalize(input.extracted?.job_title);

  const scored = candidates.map((c) => {
    let score = 0;
    const reasons: string[] = [];
    const company = normalize(c.company_name);
    const companyTokens = tokens(c.company_name);

    // 1. Known recruiter email → near-certain.
    if (from && c.contact_emails?.some((e) => e.toLowerCase() === from)) {
      score += 0.9;
      reasons.push("sender is a saved contact");
    }
    // 2. Sender domain matches the company (not a generic/platform domain).
    if (domain && !GENERIC_DOMAINS.has(domain)) {
      const domainBase = domain.split(".")[0];
      if (
        c.domains?.includes(domain) ||
        (domainBase.length > 3 && company.replace(/\s/g, "").includes(domainBase))
      ) {
        score += 0.6;
        reasons.push(`sender domain ${domain}`);
      }
    }
    // 3. Company name appears in subject/body.
    if (company && company.length > 2 && haystack.includes(company)) {
      score += 0.45;
      reasons.push("company named in email");
    } else if (companyTokens.size > 0) {
      const hits = [...companyTokens].filter((t) => haystack.includes(t)).length;
      if (hits > 0 && hits === companyTokens.size) {
        score += 0.35;
        reasons.push("company words in email");
      }
    }
    // 4. AI-extracted company/title agree.
    if (
      extractedCompany &&
      company &&
      (extractedCompany === company ||
        extractedCompany.includes(company) ||
        company.includes(extractedCompany))
    ) {
      score += 0.35;
      reasons.push("extracted company matches");
    }
    if (extractedTitle) {
      const t = tokens(c.job_title);
      const hits = [...t].filter((x) => extractedTitle.includes(x)).length;
      if (t.size > 0 && hits / t.size >= 0.6) {
        score += 0.15;
        reasons.push("job title matches");
      }
    }
    return { id: c.id, score: Math.min(1, score), reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  const alternatives = scored
    .filter((s) => s.score >= 0.3)
    .slice(0, 4)
    .map(({ id, score }) => ({ id, score }));

  if (!best || best.score < 0.45) {
    return {
      applicationId: null,
      confidence: best?.score ?? 0,
      reason: "No confident match",
      alternatives,
    };
  }
  // Ambiguous when the runner-up is close: let the user decide.
  if (second && second.score >= 0.45 && best.score - second.score < 0.2) {
    return {
      applicationId: null,
      confidence: best.score,
      reason: "Several applications look similar",
      alternatives,
    };
  }
  return {
    applicationId: best.id,
    confidence: best.score,
    reason: best.reasons.join(", "),
    alternatives,
  };
}

/** Auto-link threshold: above this the match is applied without asking; below it the user confirms. */
export const AUTO_LINK_CONFIDENCE = 0.75;
