/**
 * Follow-up scheduling helpers. Pure functions, unit tested.
 */
import {
  addBusinessDays,
  addDays,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
} from "date-fns";

import {
  DEFAULT_FOLLOW_UP_INTERVALS,
  type FollowUpIntervals,
  type FollowUpType,
} from "@/lib/constants";

export type FollowUpBucket =
  "overdue" | "today" | "upcoming" | "snoozed" | "completed" | "cancelled";

export function parseIntervals(json: unknown): FollowUpIntervals {
  const out: FollowUpIntervals = { ...DEFAULT_FOLLOW_UP_INTERVALS };
  if (json && typeof json === "object") {
    for (const key of Object.keys(out) as (keyof FollowUpIntervals)[]) {
      const v = (json as Record<string, unknown>)[key];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[key] = v;
    }
  }
  return out;
}

/**
 * Suggested due date for a follow-up of a given type, counted from `from`.
 * Application and interview/assessment intervals are business days; the second
 * follow-up interval is calendar days (matches the PRD: "7 days later").
 */
export function suggestDueDate(
  type: FollowUpType,
  from: Date,
  intervals: FollowUpIntervals = DEFAULT_FOLLOW_UP_INTERVALS,
  options: { previousCount?: number } = {},
): Date {
  const count = options.previousCount ?? 0;
  switch (type) {
    case "initial_application":
      return count === 0
        ? addBusinessDays(from, intervals.application_days)
        : addDays(from, intervals.second_days);
    case "interview":
      return addBusinessDays(from, intervals.interview_days);
    case "assessment":
      return addBusinessDays(from, intervals.assessment_days);
    case "recruiter_response":
      return addBusinessDays(from, 2);
    case "salary_negotiation":
      return addBusinessDays(from, 2);
    case "general":
    default:
      return addDays(from, intervals.second_days);
  }
}

export function suggestDueDateString(
  type: FollowUpType,
  from: Date,
  intervals?: FollowUpIntervals,
  options?: { previousCount?: number },
) {
  return format(suggestDueDate(type, from, intervals, options), "yyyy-MM-dd");
}

export interface BucketableFollowUp {
  due_date: string;
  status: "pending" | "completed" | "snoozed" | "cancelled";
  snoozed_until: string | null;
}

/** Classifies a follow-up for the Due today / Overdue / Upcoming / Snoozed / Completed views. */
export function bucketFollowUp(
  f: BucketableFollowUp,
  now: Date = new Date(),
): FollowUpBucket {
  if (f.status === "completed") return "completed";
  if (f.status === "cancelled") return "cancelled";
  const today = startOfDay(now);
  if (f.status === "snoozed") {
    const until = f.snoozed_until ? startOfDay(parseISO(f.snoozed_until)) : null;
    // A snooze that has elapsed behaves as pending again.
    if (until && isAfter(until, today)) return "snoozed";
  }
  const due = startOfDay(parseISO(f.due_date));
  if (isBefore(due, today)) return "overdue";
  if (differenceInCalendarDays(due, today) === 0) return "today";
  return "upcoming";
}

/** Days overdue (positive) or days until due (negative), relative to today. */
export function daysFromDue(dueDate: string, now: Date = new Date()) {
  return differenceInCalendarDays(startOfDay(now), startOfDay(parseISO(dueDate)));
}

export const SNOOZE_PRESETS = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
] as const;
