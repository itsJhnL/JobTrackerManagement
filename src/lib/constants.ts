/**
 * Single source of truth for domain enums, their labels, ordering and colours.
 * These mirror the Postgres enums in supabase/migrations/0001_initial_schema.sql.
 */

export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "viewed",
  "responded",
  "interview",
  "assessment",
  "offer",
  "hired",
  "rejected",
  "closed",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  viewed: "Viewed",
  responded: "Responded",
  interview: "Interview",
  assessment: "Assessment",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  closed: "Closed",
};

/** Tailwind classes for status badges. Keep muted; colour carries meaning, not volume. */
export const APPLICATION_STATUS_STYLES: Record<ApplicationStatus, string> = {
  saved: "bg-muted text-muted-foreground border-transparent",
  applied: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-transparent",
  viewed: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-transparent",
  responded: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-transparent",
  interview: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-transparent",
  assessment: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-transparent",
  offer: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-transparent",
  hired: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200 border-transparent",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-transparent",
  closed: "bg-muted text-muted-foreground border-transparent line-through",
};

/**
 * Colours for pipeline dots and charts. Pipeline order follows the dataviz
 * reference palette (blue, orange, aqua, yellow, magenta, green, violet, red),
 * validated for adjacent-pair CVD separation in both modes. Status colour is
 * always paired with a text label; it never carries identity alone.
 */
export const APPLICATION_STATUS_COLORS: Record<ApplicationStatus, string> = {
  saved: "#8a8984",
  applied: "#2a78d6",
  viewed: "#eb6834",
  responded: "#1baf7a",
  interview: "#eda100",
  assessment: "#e87ba4",
  offer: "#008300",
  hired: "#6250d6",
  rejected: "#e34948",
  closed: "#a3a29c",
};

/** Same hues stepped for the dark surface. */
export const APPLICATION_STATUS_COLORS_DARK: Record<ApplicationStatus, string> = {
  saved: "#8a8984",
  applied: "#3987e5",
  viewed: "#d95926",
  responded: "#199e70",
  interview: "#c98500",
  assessment: "#d55181",
  offer: "#008300",
  hired: "#9085e9",
  rejected: "#e66767",
  closed: "#6f6e69",
};

/** Single-series chart colour (reference palette slot 1). */
export const CHART_SERIES = { light: "#2a78d6", dark: "#3987e5" } as const;

/** Statuses that count as "active" (still in play). */
export const ACTIVE_STATUSES: readonly ApplicationStatus[] = [
  "applied",
  "viewed",
  "responded",
  "interview",
  "assessment",
  "offer",
];

export const TERMINAL_STATUSES: readonly ApplicationStatus[] = [
  "hired",
  "rejected",
  "closed",
];

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "freelance",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  freelance: "Freelance",
};

export const RATE_TYPES = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "annual",
  "fixed_project",
] as const;
export type RateType = (typeof RATE_TYPES)[number];
export const RATE_TYPE_LABELS: Record<RateType, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  annual: "Annual",
  fixed_project: "Fixed project",
};
export const RATE_TYPE_SUFFIX: Record<RateType, string> = {
  hourly: "/hr",
  daily: "/day",
  weekly: "/wk",
  monthly: "/mo",
  annual: "/yr",
  fixed_project: " total",
};

export const CURRENCIES = [
  "USD",
  "PHP",
  "AUD",
  "CAD",
  "GBP",
  "EUR",
  "SGD",
  "NZD",
  "INR",
  "JPY",
  "AED",
] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
export const PRIORITY_STYLES: Record<Priority, string> = {
  low: "text-muted-foreground",
  medium: "text-sky-600 dark:text-sky-400",
  high: "text-amber-600 dark:text-amber-400",
  urgent: "text-rose-600 dark:text-rose-400",
};

export const FOLLOW_UP_TYPES = [
  "initial_application",
  "interview",
  "assessment",
  "recruiter_response",
  "salary_negotiation",
  "general",
] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];
export const FOLLOW_UP_TYPE_LABELS: Record<FollowUpType, string> = {
  initial_application: "Application follow-up",
  interview: "Interview follow-up",
  assessment: "Assessment follow-up",
  recruiter_response: "Recruiter response",
  salary_negotiation: "Salary negotiation",
  general: "General",
};

export const FOLLOW_UP_STATUSES = [
  "pending",
  "completed",
  "snoozed",
  "cancelled",
] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];
export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  snoozed: "Snoozed",
  cancelled: "Cancelled",
};

export const INTERVIEW_TYPES = [
  "phone_screen",
  "video",
  "onsite",
  "technical",
  "behavioral",
  "panel",
  "final",
  "other",
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];
export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  phone_screen: "Phone screen",
  video: "Video call",
  onsite: "On-site",
  technical: "Technical",
  behavioral: "Behavioral",
  panel: "Panel",
  final: "Final round",
  other: "Other",
};

export const INTERVIEW_OUTCOMES = [
  "pending",
  "passed",
  "failed",
  "no_show",
  "cancelled",
] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];
export const INTERVIEW_OUTCOME_LABELS: Record<InterviewOutcome, string> = {
  pending: "Pending",
  passed: "Passed",
  failed: "Not selected",
  no_show: "No show",
  cancelled: "Cancelled",
};

export const ASSESSMENT_STATUSES = [
  "not_started",
  "in_progress",
  "submitted",
  "passed",
  "failed",
  "expired",
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];
export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  passed: "Passed",
  failed: "Not passed",
  expired: "Expired",
};

export const COMMUNICATION_TYPES = [
  "email",
  "message",
  "call",
  "video",
  "in_person",
  "other",
] as const;
export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];
export const COMMUNICATION_TYPE_LABELS: Record<CommunicationType, string> = {
  email: "Email",
  message: "Message",
  call: "Call",
  video: "Video call",
  in_person: "In person",
  other: "Other",
};

export const COMMUNICATION_DIRECTIONS = ["outbound", "inbound"] as const;
export type CommunicationDirection = (typeof COMMUNICATION_DIRECTIONS)[number];

export const DOCUMENT_TYPES = [
  "resume",
  "cover_letter",
  "portfolio",
  "assessment",
  "offer",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  resume: "Resume",
  cover_letter: "Cover letter",
  portfolio: "Portfolio",
  assessment: "Assessment",
  offer: "Offer",
  other: "Other",
};

export const ACTIVITY_TYPES = [
  "application_created",
  "status_changed",
  "interview_scheduled",
  "interview_updated",
  "assessment_added",
  "assessment_updated",
  "follow_up_created",
  "follow_up_completed",
  "follow_up_snoozed",
  "communication_logged",
  "contact_added",
  "document_uploaded",
  "application_archived",
  "application_restored",
  "note_added",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const TEMPLATE_CATEGORIES = [
  "cover_letter",
  "follow_up",
  "recruiter_message",
  "screening",
  "general",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  cover_letter: "Cover letter",
  follow_up: "Follow-up",
  recruiter_message: "Recruiter message",
  screening: "Screening answer",
  general: "General",
};

export const WORKING_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WorkingDay = (typeof WORKING_DAYS)[number];
export const WORKING_DAY_LABELS: Record<WorkingDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export const PLATFORM_SUGGESTIONS = [
  "LinkedIn",
  "Upwork",
  "OnlineJobs.ph",
  "Indeed",
  "Wellfound",
  "Glassdoor",
  "Remote OK",
  "We Work Remotely",
  "Company website",
  "Referral",
  "Recruiter",
  "Other",
] as const;

export const PAYMENT_FREQUENCIES = [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "milestone",
  "on_completion",
] as const;
export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];
export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
  milestone: "Per milestone",
  on_completion: "On completion",
};

/** Minimum sample size before a percentage is shown in analytics. */
export const MIN_SAMPLE_FOR_RATES = 5;

export interface FollowUpIntervals {
  application_days: number;
  second_days: number;
  interview_days: number;
  assessment_days: number;
}
export const DEFAULT_FOLLOW_UP_INTERVALS: Readonly<FollowUpIntervals> = {
  application_days: 3,
  second_days: 7,
  interview_days: 2,
  assessment_days: 3,
};
