import type { ApplicationContext, EmailInput, ProfileContext, WriterKind } from "./types";

/**
 * Prompt builders. Provider-agnostic: they return plain system/user strings.
 * Every prompt that touches the user's profile carries the same grounding rule:
 * never invent experience, skills, employers, dates, metrics or achievements.
 */

export const GROUNDING_RULE = `Ground every claim about the candidate strictly in the VERIFIED PROFILE below.
Do not invent, embellish or assume experience, skills, employers, dates, metrics, certifications or achievements.
If the profile lacks something the job asks for, say so plainly instead of filling the gap.
Return only the JSON object requested, with no markdown fences or commentary.`;

function section(title: string, body: string | null | undefined) {
  return body && body.trim() ? `### ${title}\n${body.trim()}\n` : "";
}

export function profileBlock(p: ProfileContext) {
  const exp = p.experience
    .map(
      (e) =>
        `- ${e.title} at ${e.company} (${e.start || "?"} – ${e.end || "present"})${e.highlights.length ? `\n  ${e.highlights.map((h) => `• ${h}`).join("\n  ")}` : ""}`,
    )
    .join("\n");
  const projects = p.projects
    .map(
      (pr) =>
        `- ${pr.name}${pr.technologies.length ? ` [${pr.technologies.join(", ")}]` : ""}: ${pr.description}${pr.url ? ` (${pr.url})` : ""}`,
    )
    .join("\n");
  return [
    "## VERIFIED PROFILE (the only source of truth about the candidate)",
    section("Name", p.full_name),
    section("Summary", p.professional_summary),
    section("Skills", p.skills.join(", ")),
    section("Experience", exp),
    section("Projects", projects),
    section("Portfolio", p.portfolio_url),
  ]
    .filter(Boolean)
    .join("\n");
}

export function applicationBlock(a: ApplicationContext) {
  return [
    "## APPLICATION",
    section("Company", a.company_name),
    section("Role", a.job_title),
    section("Platform", a.platform),
    section("Status", a.status),
    section("Applied on", a.applied_at),
    section("Previous follow-ups", String(a.follow_up_count)),
    section("Last communication", a.last_communication),
    section(
      "Job description",
      a.job_description ? a.job_description.slice(0, 12000) : null,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

export const parseJobPrompt = (text: string) => ({
  system: `You extract structured data from job postings. Be literal: only report what the posting states.
Use null for anything not stated. Salary figures are numbers without currency symbols; put the ISO 4217 currency code in "currency".
rate_type must be one of hourly, daily, weekly, monthly, annual, fixed_project. employment_type must be one of full_time, part_time, contract, freelance.
work_arrangement is remote, hybrid or onsite, only when the posting says so (e.g. "work from home" = remote, "2 days in office" = hybrid, a required office location with no remote option = onsite); otherwise null.
"location" is the city/region/country of the job or, for remote roles, the region applicants must be in. "company" is the hiring employer, never the job board (LinkedIn, Indeed, OnlineJobs.ph and similar are platforms, not employers).
"required_skills" are concrete skills/tools; "qualifications" are other requirements such as years of experience, education, certifications or languages. "application_url" is an explicit link for applying, if one is given.
If the input includes STRUCTURED DATA from the page markup, treat it as authoritative and use the page text only to fill what it lacks.
"screening_questions" are questions the applicant must answer; "required_links_or_assessments" are portfolio links, tests or tasks demanded.
"required_subject_line" is any exact email subject the posting insists on. "summary" is two sentences, neutral tone.
Return only the JSON object.`,
  user: `JOB POSTING:\n"""\n${text}\n"""`,
});

export const analyzeFitPrompt = (jobText: string, profile: ProfileContext) => ({
  system: `You are a careful career advisor comparing a job description with a candidate profile.
${GROUNDING_RULE}
"verified_evidence" lists profile facts that support the match. "assumptions" lists anything you inferred that is NOT in the profile; keep that list honest.
match_percentage is 0-100 and should be conservative when the profile is thin. Recommendations are concrete actions for this application.`,
  user: `${profileBlock(profile)}\n\n## JOB DESCRIPTION\n"""\n${jobText.slice(0, 12000)}\n"""`,
});

const WRITER_INSTRUCTIONS: Record<WriterKind, string> = {
  cover_letter:
    "Write a cover letter of 180-260 words: a specific opening tied to the company or role, two short paragraphs of relevant evidence, a confident close. No placeholders like [Company].",
  application_email:
    "Write a short application email (90-140 words) with a clear subject line, one paragraph of fit, a line pointing to the portfolio if one exists, and a polite close.",
  screening_answer:
    "Answer the screening question directly in 60-150 words using only verified profile facts. If the profile cannot answer it, say what the candidate can honestly offer instead.",
  recruiter_message:
    "Write a recruiter message (60-110 words) suitable for LinkedIn or a job platform: who the candidate is, why this role, one proof point, a soft call to action.",
};

export const writePrompt = (
  kind: WriterKind,
  app: ApplicationContext,
  profile: ProfileContext,
  extra: { question?: string; tone?: string; instructions?: string },
) => ({
  system: `You write job application material on behalf of the candidate, in first person.
${GROUNDING_RULE}
${WRITER_INSTRUCTIONS[kind]}
Tone: ${extra.tone ?? "professional"}. Plain text, no markdown. "used_facts" lists the profile facts you relied on; "gaps" lists requirements you could not address from the profile.
"subject" is null unless an email subject makes sense.`,
  user: [
    profileBlock(profile),
    applicationBlock(app),
    section("Screening question", extra.question),
    section("Extra instructions from the candidate", extra.instructions),
  ]
    .filter(Boolean)
    .join("\n\n"),
});

export const followUpPrompt = (
  app: ApplicationContext,
  extra: { tone?: string; instructions?: string },
) => ({
  system: `You draft a concise, natural follow-up message (60-120 words) from the candidate to the employer or recruiter.
Reference the role and when they applied or last spoke. Match the number of previous follow-ups: the first is light, later ones are briefer and acknowledge the earlier message.
Do not invent details about the company or the candidate. No markdown. "subject" may be null for chat-style messages. Tone: ${extra.tone ?? "professional"}.`,
  user: [applicationBlock(app), section("Extra instructions", extra.instructions)]
    .filter(Boolean)
    .join("\n\n"),
});

export const interviewPrepPrompt = (
  app: ApplicationContext,
  profile: ProfileContext,
) => ({
  system: `You prepare a candidate for an interview.
${GROUNDING_RULE}
Produce 6-8 likely questions, 5-8 technical questions tied to the job description, 5 behavioral questions, 4-6 suggested answers in first person based only on the profile (each with "based_on" listing the profile facts used), and 5 thoughtful questions to ask the employer.`,
  user: [profileBlock(profile), applicationBlock(app)].join("\n\n"),
});

export const classifyEmailPrompt = (email: EmailInput) => ({
  system: `You read one email received by a job seeker and decide whether it is recruiting-related.
Classify "kind" as one of: application_confirmation, recruiter_response, interview_invitation, interview_reschedule, job_offer, rejection, other_recruiting, not_recruiting.
Newsletters, job alerts, marketing and platform notifications that are not about one of the user's own applications are not_recruiting.
Extract only what the email states. Dates: resolve to ISO 8601 with a UTC offset using the user's time zone (${email.user_timezone}) for relative or zone-less times; null when no date is given.
"suggested_status" is one of applied, viewed, responded, shortlisted, interview, assessment, offer, hired, rejected, or null.
Match the email to one of the CANDIDATE APPLICATIONS by company and role; set matched_application_id to its id or null, and match_confidence 0-1. Never invent an id.
Return only the JSON object.`,
  user: [
    `## CANDIDATE APPLICATIONS\n${email.candidates.map((c) => `- id=${c.id} · ${c.company_name} · ${c.job_title}`).join("\n") || "(none)"}`,
    `## EMAIL\nFrom: ${email.from_name ?? ""} <${email.from_email ?? ""}>\nSubject: ${email.subject}\nReceived: ${email.received_at}\n\n${email.text.slice(0, 6000)}`,
  ].join("\n\n"),
});
