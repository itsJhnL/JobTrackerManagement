import { format, startOfWeek, subWeeks } from "date-fns";

import type { SupabaseServerClient } from "@/lib/supabase/server";
import {
  APPLICATION_STATUSES,
  EMPLOYMENT_TYPE_LABELS,
  MIN_SAMPLE_FOR_RATES,
  type ApplicationStatus,
} from "@/lib/constants";
import { estimateCompensation, round2 } from "@/lib/compensation";

export interface RateMetric {
  /** null when the sample is too small to be meaningful. */
  value: number | null;
  numerator: number;
  denominator: number;
}

export interface AnalyticsData {
  total: number;
  weeks: { week: string; label: string; count: number }[];
  responseRate: RateMetric;
  interviewRate: RateMetric;
  offerRate: RateMetric;
  rejectionRate: RateMetric;
  avgProposedHourly: { currency: string; value: number; count: number }[];
  avgNegotiatedHourly: { currency: string; value: number; count: number }[];
  byPlatform: { name: string; count: number }[];
  byEmploymentType: { name: string; count: number }[];
  byStatus: { status: ApplicationStatus; count: number }[];
  /** Mean days from first 'applied' to first response-type status; null below the sample floor. */
  avgDaysToResponse: { value: number | null; count: number };
  months: { month: string; label: string; count: number }[];
  minSample: number;
}

function rate(numerator: number, denominator: number): RateMetric {
  return {
    value: denominator >= MIN_SAMPLE_FOR_RATES ? numerator / denominator : null,
    numerator,
    denominator,
  };
}

const RESPONDED: ApplicationStatus[] = [
  "responded",
  "interview",
  "assessment",
  "offer",
  "hired",
];
const INTERVIEWED: ApplicationStatus[] = ["interview", "assessment", "offer", "hired"];
const OFFERED: ApplicationStatus[] = ["offer", "hired"];

export async function getAnalytics(
  supabase: SupabaseServerClient,
  userId: string,
  weeksBack = 12,
): Promise<AnalyticsData> {
  const [{ data: apps, error }, { data: history, error: historyError }] =
    await Promise.all([
      supabase
        .from("applications")
        .select(
          "id, status, platform, employment_type, applied_at, created_at, currency, rate_type, proposed_rate, negotiated_rate, hours_per_week, hours_per_day, working_days",
        )
        .eq("user_id", userId)
        .is("archived_at", null),
      supabase
        .from("application_status_history")
        .select("application_id, new_status, changed_at")
        .eq("user_id", userId),
    ]);
  if (error) throw error;
  if (historyError) throw historyError;

  const rows = apps ?? [];
  // Submitted = everything that has moved past "saved" at any point.
  const everSubmitted = new Set(
    (history ?? []).filter((h) => h.new_status !== "saved").map((h) => h.application_id),
  );
  const submitted = rows.filter((a) => a.status !== "saved" || everSubmitted.has(a.id));
  const reached = (statuses: ApplicationStatus[]) => {
    const ids = new Set(
      (history ?? [])
        .filter((h) => statuses.includes(h.new_status))
        .map((h) => h.application_id),
    );
    return rows.filter((a) => statuses.includes(a.status) || ids.has(a.id)).length;
  };

  // Applications submitted per week for the last N weeks (by applied_at, falling back to created_at).
  const now = new Date();
  const weekStarts = Array.from({ length: weeksBack }, (_, i) =>
    startOfWeek(subWeeks(now, weeksBack - 1 - i), { weekStartsOn: 1 }),
  );
  const weekKey = (d: Date) => format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const counts = new Map(weekStarts.map((w) => [format(w, "yyyy-MM-dd"), 0]));
  for (const a of submitted) {
    const d = a.applied_at
      ? new Date(a.applied_at + "T12:00:00")
      : new Date(a.created_at);
    const key = weekKey(d);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const weeks = weekStarts.map((w) => ({
    week: format(w, "yyyy-MM-dd"),
    label: format(w, "MMM d"),
    count: counts.get(format(w, "yyyy-MM-dd")) ?? 0,
  }));

  const hourlyAvg = (field: "proposed_rate" | "negotiated_rate") => {
    const acc = new Map<string, { sum: number; count: number }>();
    for (const a of rows) {
      const est = estimateCompensation({
        rate: a[field],
        rateType: a.rate_type,
        hoursPerWeek: a.hours_per_week,
        hoursPerDay: a.hours_per_day,
        workingDaysPerWeek: a.working_days.length || null,
      });
      if (est.hourly === null) continue;
      const e = acc.get(a.currency) ?? { sum: 0, count: 0 };
      e.sum += est.hourly;
      e.count += 1;
      acc.set(a.currency, e);
    }
    return [...acc]
      .map(([currency, { sum, count }]) => ({
        currency,
        value: round2(sum / count),
        count,
      }))
      .sort((x, y) => y.count - x.count);
  };

  const groupBy = (get: (a: (typeof rows)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const a of rows) {
      const k = get(a) ?? "Not specified";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m]
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count);
  };

  // Time to first response: first "applied" -> first responded/shortlisted/interview/assessment/offer/hired.
  const firstApplied = new Map<string, number>();
  const firstResponse = new Map<string, number>();
  for (const h of history ?? []) {
    const t = new Date(h.changed_at).getTime();
    if (h.new_status === "applied")
      firstApplied.set(
        h.application_id,
        Math.min(firstApplied.get(h.application_id) ?? Infinity, t),
      );
    if (RESPONDED.includes(h.new_status))
      firstResponse.set(
        h.application_id,
        Math.min(firstResponse.get(h.application_id) ?? Infinity, t),
      );
  }
  const gaps: number[] = [];
  for (const [id, applied] of firstApplied) {
    const responded = firstResponse.get(id);
    if (responded !== undefined && responded >= applied)
      gaps.push((responded - applied) / 86_400_000);
  }
  const avgDaysToResponse = {
    value:
      gaps.length >= MIN_SAMPLE_FOR_RATES
        ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10
        : null,
    count: gaps.length,
  };

  // Applications per calendar month (last 12 months).
  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    monthKeys.push(format(new Date(now.getFullYear(), now.getMonth() - i, 1), "yyyy-MM"));
  }
  const monthCounts = new Map(monthKeys.map((k) => [k, 0]));
  for (const a of submitted) {
    const d = a.applied_at
      ? new Date(a.applied_at + "T12:00:00")
      : new Date(a.created_at);
    const k = format(d, "yyyy-MM");
    if (monthCounts.has(k)) monthCounts.set(k, (monthCounts.get(k) ?? 0) + 1);
  }
  const months = monthKeys.map((k) => ({
    month: k,
    label: format(new Date(k + "-01T12:00:00"), "MMM yy"),
    count: monthCounts.get(k) ?? 0,
  }));

  return {
    total: rows.length,
    avgDaysToResponse,
    months,
    weeks,
    responseRate: rate(reached(RESPONDED), submitted.length),
    interviewRate: rate(reached(INTERVIEWED), submitted.length),
    offerRate: rate(reached(OFFERED), submitted.length),
    rejectionRate: rate(
      rows.filter((a) => a.status === "rejected").length,
      submitted.length,
    ),
    avgProposedHourly: hourlyAvg("proposed_rate"),
    avgNegotiatedHourly: hourlyAvg("negotiated_rate"),
    byPlatform: groupBy((a) => a.platform),
    byEmploymentType: groupBy((a) =>
      a.employment_type ? EMPLOYMENT_TYPE_LABELS[a.employment_type] : null,
    ),
    byStatus: APPLICATION_STATUSES.map((status) => ({
      status,
      count: rows.filter((a) => a.status === status).length,
    })),
    minSample: MIN_SAMPLE_FOR_RATES,
  };
}
