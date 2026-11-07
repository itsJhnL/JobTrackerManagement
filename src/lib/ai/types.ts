/**
 * Provider-agnostic AI contracts. The UI and route handlers only ever see these
 * types; provider specifics stay inside src/lib/ai/providers/*.
 */

export interface ParsedJob {
  company: string | null;
  job_title: string | null;
  location: string | null;
  responsibilities: string[];
  required_skills: string[];
  preferred_skills: string[];
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  /** hourly | daily | weekly | monthly | annual | fixed_project | null */
  rate_type: string | null;
  hours_per_week: number | null;
  working_hours: string | null;
  timezone: string | null;
  /** full_time | part_time | contract | freelance | null */
  employment_type: string | null;
  application_instructions: string | null;
  required_subject_line: string | null;
  screening_questions: string[];
  required_links_or_assessments: string[];
  summary: string | null;
}

export interface FitAnalysis {
  match_percentage: number;
  matching_skills: string[];
  missing_skills: string[];
  experience_gaps: string[];
  potential_concerns: string[];
  recommendations: string[];
  /** Statements grounded in the user's saved profile. */
  verified_evidence: string[];
  /** Statements the model inferred; shown separately, never as fact. */
  assumptions: string[];
}

export type WriterKind =
  "cover_letter" | "application_email" | "screening_answer" | "recruiter_message";

export interface WriterOutput {
  subject: string | null;
  body: string;
  /** Facts the model used from the profile, so the user can verify. */
  used_facts: string[];
  /** Things the model wanted to say but had no verified source for. */
  gaps: string[];
}

export interface FollowUpDraft {
  subject: string | null;
  body: string;
}

export interface InterviewPrep {
  likely_questions: string[];
  technical_questions: string[];
  behavioral_questions: string[];
  suggested_answers: { question: string; answer: string; based_on: string[] }[];
  questions_to_ask: string[];
}

export interface ProfileContext {
  full_name: string | null;
  professional_summary: string | null;
  skills: string[];
  experience: {
    title: string;
    company: string;
    start: string;
    end: string;
    highlights: string[];
  }[];
  projects: { name: string; description: string; url: string; technologies: string[] }[];
  portfolio_url: string | null;
}

export interface ApplicationContext {
  company_name: string;
  job_title: string;
  status: string;
  job_description: string | null;
  platform: string | null;
  applied_at: string | null;
  last_communication: string | null;
  follow_up_count: number;
}

export type AiErrorCode =
  | "not_configured"
  | "quota_exceeded"
  | "rate_limited"
  | "invalid_response"
  | "provider_error"
  | "unauthorized"
  | "bad_request"
  | "model_unavailable";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
    public retryable = false,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export type EmailKind =
  | "application_confirmation"
  | "recruiter_response"
  | "interview_invitation"
  | "interview_reschedule"
  | "job_offer"
  | "rejection"
  | "other_recruiting"
  | "not_recruiting";

/** Structured read of one email, used to match it to an application and to pre-fill an interview. */
export interface EmailAnalysis {
  kind: EmailKind;
  /** 0–1, how sure the model is about `kind`. */
  confidence: number;
  company: string | null;
  job_title: string | null;
  recruiter_name: string | null;
  recruiter_email: string | null;
  /** ISO 8601 with offset when the email states a date/time, else null. */
  interview_start: string | null;
  interview_end: string | null;
  /** IANA zone or abbreviation as written in the email. */
  interview_timezone: string | null;
  interview_platform: string | null;
  meeting_url: string | null;
  instructions: string | null;
  /** Status the email implies for the application, if any. */
  suggested_status: string | null;
  summary: string;
}

export interface EmailInput {
  from_name: string | null;
  from_email: string | null;
  subject: string;
  received_at: string;
  text: string;
  /** Candidate applications to match against (company + title only). */
  candidates: { id: string; company_name: string; job_title: string }[];
  /** User's zone, so relative dates ("tomorrow 3pm") resolve correctly. */
  user_timezone: string;
}

export interface AiHealth {
  provider: string;
  model: string;
  usedFallback: boolean;
  latencyMs: number;
}

export interface AiProvider {
  readonly name: string;
  /** Cheap round-trip that verifies key, model access and quota. */
  healthCheck(): Promise<AiHealth>;
  /** Classifies a recruiting email and extracts interview details. */
  classifyEmail(
    email: EmailInput,
  ): Promise<
    EmailAnalysis & { matched_application_id: string | null; match_confidence: number }
  >;
  parseJob(jobText: string): Promise<ParsedJob>;
  analyzeFit(jobText: string, profile: ProfileContext): Promise<FitAnalysis>;
  write(
    kind: WriterKind,
    app: ApplicationContext,
    profile: ProfileContext,
    extra: { question?: string; tone?: string; instructions?: string },
  ): Promise<WriterOutput>;
  draftFollowUp(
    app: ApplicationContext,
    extra: { tone?: string; instructions?: string },
  ): Promise<FollowUpDraft>;
  prepareInterview(
    app: ApplicationContext,
    profile: ProfileContext,
  ): Promise<InterviewPrep>;
}
