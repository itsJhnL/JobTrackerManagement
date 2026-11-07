import type { ParsedJob } from "@/lib/ai/types";
import { CURRENCIES, EMPLOYMENT_TYPES, RATE_TYPES } from "@/lib/constants";
import type { QuickApplicationInput } from "@/lib/validations/application";

import { looksLikeUrl } from "./job-url/extract";

export const WORK_ARRANGEMENT_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

/**
 * Applications have no separate work-arrangement column, so it is stored at
 * the start of the location: "Remote · Philippines", "Hybrid · Makati", "On-site".
 */
export function formatLocation(arrangement: string | null, location: string | null) {
  const label = arrangement ? WORK_ARRANGEMENT_LABELS[arrangement] : null;
  const place = location?.trim() || null;
  if (label && place && !place.toLowerCase().includes(label.toLowerCase()))
    return `${label} · ${place}`;
  return place ?? label ?? null;
}

function isOneOf<const T extends readonly string[]>(
  value: string | null | undefined,
  list: T,
): value is T[number] {
  return !!value && (list as readonly string[]).includes(value);
}

export function buildNotes(p: ParsedJob) {
  const parts: string[] = [];
  const bullets = (items: string[]) => items.map((q) => `- ${q}`).join("\n");
  if (p.required_skills.length)
    parts.push(`Required skills:\n${bullets(p.required_skills)}`);
  if (p.preferred_skills.length)
    parts.push(`Nice-to-have skills:\n${bullets(p.preferred_skills)}`);
  if (p.qualifications?.length)
    parts.push(`Qualifications:\n${bullets(p.qualifications)}`);
  if (p.application_instructions)
    parts.push(`Application instructions:\n${p.application_instructions}`);
  if (p.application_url && p.application_url !== p.source_url)
    parts.push(`Apply at: ${p.application_url}`);
  if (p.required_subject_line)
    parts.push(`Required subject line: ${p.required_subject_line}`);
  if (p.screening_questions.length)
    parts.push(`Screening questions:\n${bullets(p.screening_questions)}`);
  if (p.required_links_or_assessments.length)
    parts.push(
      `Required links / assessments:\n${bullets(p.required_links_or_assessments)}`,
    );
  if (p.working_hours) parts.push(`Working hours: ${p.working_hours}`);
  if (p.salary_min !== null || p.salary_max !== null) {
    parts.push(
      `Stated pay: ${[p.salary_min, p.salary_max].filter((v) => v !== null).join(" – ")} ${p.currency ?? ""} ${p.rate_type ?? ""}`.trim(),
    );
  }
  return parts.join("\n\n");
}

/**
 * Fills the quick-add form from a parsed job. Fields the job doesn't state keep
 * their current value (blank or the user's defaults); nothing is guessed.
 */
export function valuesFromParsed(
  current: QuickApplicationInput,
  p: ParsedJob,
  pastedText: string,
): QuickApplicationInput {
  const rate = p.salary_min ?? p.salary_max ?? null;
  const pastedIsUrl = looksLikeUrl(pastedText);
  const description =
    p.job_description ?? (pastedText && !pastedIsUrl ? pastedText : null);
  const link =
    p.source_url ??
    (pastedIsUrl ? pastedText.trim() : null) ??
    (p.application_url && /^https?:\/\//i.test(p.application_url)
      ? p.application_url
      : null);
  return {
    ...current,
    company_name: p.company ?? current.company_name,
    job_title: p.job_title ?? current.job_title,
    job_url: link ?? current.job_url,
    platform: p.platform ?? current.platform,
    location: formatLocation(p.work_arrangement, p.location) ?? current.location,
    employment_type: isOneOf(p.employment_type, EMPLOYMENT_TYPES)
      ? p.employment_type
      : current.employment_type,
    rate_type: isOneOf(p.rate_type, RATE_TYPES) ? p.rate_type : current.rate_type,
    currency: isOneOf(p.currency, CURRENCIES) ? p.currency : current.currency,
    offered_rate: rate ?? current.offered_rate,
    hours_per_week: p.hours_per_week ?? current.hours_per_week,
    timezone: p.timezone ?? current.timezone,
    job_description: description ?? current.job_description,
    notes: buildNotes(p),
  };
}
