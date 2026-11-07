import { z } from "zod";

/**
 * Zod schemas for every AI output. They validate provider responses (never
 * trust the model) and double as JSON schemas for structured-output mode.
 */

const str = z.string().nullable();
const strList = z.array(z.string());
const num = z.number().nullable();

export const parsedJobSchema = z.object({
  company: str,
  job_title: str,
  location: str,
  responsibilities: strList,
  required_skills: strList,
  preferred_skills: strList,
  salary_min: num,
  salary_max: num,
  currency: str,
  rate_type: z
    .enum(["hourly", "daily", "weekly", "monthly", "annual", "fixed_project"])
    .nullable(),
  hours_per_week: num,
  working_hours: str,
  timezone: str,
  employment_type: z.enum(["full_time", "part_time", "contract", "freelance"]).nullable(),
  application_instructions: str,
  required_subject_line: str,
  screening_questions: strList,
  required_links_or_assessments: strList,
  summary: str,
});

export const fitAnalysisSchema = z.object({
  match_percentage: z.number().min(0).max(100),
  matching_skills: strList,
  missing_skills: strList,
  experience_gaps: strList,
  potential_concerns: strList,
  recommendations: strList,
  verified_evidence: strList,
  assumptions: strList,
});

export const writerOutputSchema = z.object({
  subject: str,
  body: z.string(),
  used_facts: strList,
  gaps: strList,
});

export const followUpDraftSchema = z.object({
  subject: str,
  body: z.string(),
});

export const emailAnalysisSchema = z.object({
  kind: z.enum([
    "application_confirmation",
    "recruiter_response",
    "interview_invitation",
    "interview_reschedule",
    "job_offer",
    "rejection",
    "other_recruiting",
    "not_recruiting",
  ]),
  confidence: z.number().min(0).max(1),
  company: str,
  job_title: str,
  recruiter_name: str,
  recruiter_email: str,
  interview_start: str,
  interview_end: str,
  interview_timezone: str,
  interview_platform: str,
  meeting_url: str,
  instructions: str,
  suggested_status: str,
  summary: z.string(),
  matched_application_id: str,
  match_confidence: z.number().min(0).max(1),
});

export const interviewPrepSchema = z.object({
  likely_questions: strList,
  technical_questions: strList,
  behavioral_questions: strList,
  suggested_answers: z.array(
    z.object({ question: z.string(), answer: z.string(), based_on: strList }),
  ),
  questions_to_ask: strList,
});

/** JSON Schema (draft 2020-12) for structured output; nullable → anyOf null. */
export function toJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, { target: "draft-2020-12", io: "output" });
}

// ---- Request bodies for the route handlers -------------------------------

export const parseJobRequest = z.object({
  text: z.string().trim().min(40, "Paste the full job post").max(40000),
});

export const analyzeFitRequest = z
  .object({
    application_id: z.uuid().optional(),
    job_text: z.string().trim().max(40000).optional(),
  })
  .refine((v) => v.application_id || (v.job_text && v.job_text.length >= 40), {
    message: "Provide an application or a job description",
  });

export const writeRequest = z.object({
  application_id: z.uuid(),
  kind: z.enum([
    "cover_letter",
    "application_email",
    "screening_answer",
    "recruiter_message",
  ]),
  question: z.string().trim().max(2000).optional(),
  tone: z
    .enum(["professional", "friendly", "concise", "enthusiastic"])
    .default("professional"),
  instructions: z.string().trim().max(2000).optional(),
});

export const followUpRequest = z.object({
  application_id: z.uuid(),
  tone: z.enum(["professional", "friendly", "concise"]).default("professional"),
  instructions: z.string().trim().max(1000).optional(),
});

export const interviewPrepRequest = z.object({ application_id: z.uuid() });
