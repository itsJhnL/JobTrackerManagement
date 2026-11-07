import type { ParsedJob } from "@/lib/ai/types";

import { platformFromUrl, type ExtractedPage } from "./extract";

/** Characters of page text sent to the AI (job pages rarely need more). */
const MAX_PAGE_TEXT = 18_000;

/** Minimum readable content before we try to parse a page at all. */
export const MIN_USEFUL_TEXT = 200;

/** True when the page has enough content to be worth parsing. */
export function hasUsefulContent(page: ExtractedPage) {
  return (
    !!page.structured?.title ||
    (page.structured?.description?.length ?? 0) >= MIN_USEFUL_TEXT ||
    page.text.length >= MIN_USEFUL_TEXT
  );
}

/** The employer's description when it is substantial or richer than the page text. */
export function bestDescription(page: ExtractedPage) {
  const d = page.structured?.description ?? "";
  return d && (d.length >= MIN_USEFUL_TEXT || d.length >= page.text.length)
    ? d
    : page.text;
}

/** The text handed to the AI parser: the URL, the page markup facts and the page text. */
export function buildParseInput(page: ExtractedPage, url: string) {
  const s = page.structured;
  const facts = s
    ? JSON.stringify(
        {
          title: s.title,
          company: s.company,
          location: s.location,
          work_arrangement: s.work_arrangement,
          employment_type: s.employment_type,
          salary_min: s.salary_min,
          salary_max: s.salary_max,
          currency: s.currency,
          rate_type: s.rate_type,
          skills: s.skills,
          qualifications: s.qualifications,
        },
        null,
        1,
      )
    : null;
  // Prefer the employer's description; fall back to the page text.
  const body = bestDescription(page);
  return [
    `SOURCE URL: ${url}`,
    page.pageTitle ? `PAGE TITLE: ${page.pageTitle}` : null,
    facts ? `STRUCTURED DATA (from the page's JobPosting markup):\n${facts}` : null,
    `PAGE TEXT:\n${body.slice(0, MAX_PAGE_TEXT)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const pick = <T>(structured: T | null | undefined, ai: T | null | undefined) =>
  structured !== null && structured !== undefined && structured !== ""
    ? structured
    : (ai ?? null);

function unique(items: string[]) {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Combines the AI result with the page markup. Markup values win (they come
 * from the employer); the AI only fills gaps. Nothing is invented here: a field
 * neither source states stays null.
 */
export function mergeParsedJob(
  ai: ParsedJob,
  page: ExtractedPage,
  sourceUrl: string,
): ParsedJob {
  const s = page.structured;
  const salaryFromMarkup = s && (s.salary_min !== null || s.salary_max !== null);
  const platform = platformFromUrl(sourceUrl);

  // A job board's own name is never the employer.
  const aiCompany =
    ai.company && platform && ai.company.toLowerCase() === platform.toLowerCase()
      ? null
      : ai.company;

  return {
    ...ai,
    company: pick(s?.company, aiCompany),
    job_title: pick(s?.title, ai.job_title),
    location: pick(s?.location, ai.location),
    work_arrangement: pick(s?.work_arrangement, ai.work_arrangement),
    employment_type: pick(s?.employment_type, ai.employment_type),
    // Keep pay fields together so a markup range is never mixed with an AI currency.
    salary_min: salaryFromMarkup ? s.salary_min : ai.salary_min,
    salary_max: salaryFromMarkup ? s.salary_max : ai.salary_max,
    currency: salaryFromMarkup ? (s.currency ?? ai.currency) : ai.currency,
    rate_type: salaryFromMarkup ? (s.rate_type ?? ai.rate_type) : ai.rate_type,
    required_skills: unique([...(s?.skills ?? []), ...ai.required_skills]).slice(0, 40),
    qualifications: unique([...(s?.qualifications ?? []), ...ai.qualifications]).slice(
      0,
      40,
    ),
    application_url: pick(ai.application_url, s?.application_url) ?? sourceUrl,
    source_url: sourceUrl,
    platform,
    job_description: bestDescription(page).slice(0, 20_000) || null,
  };
}
