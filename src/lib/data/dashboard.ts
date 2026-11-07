import type { SupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_STATUSES, type ApplicationStatus } from "@/lib/constants";
import {
  averageHourlyByCurrency,
  bandFor,
  estimateForApplication,
  HOURLY_BANDS,
  totalsByCurrency,
} from "@/lib/compensation";

import { listRecentActivities, type ActivityWithApplication } from "./activities";
import {
  countByStatus,
  listApplications,
  type ApplicationListItem,
} from "./applications";
import { listFollowUps, type FollowUpWithApplication } from "./follow-ups";

export interface CurrencyTotal {
  currency: string;
  monthly: number;
  count: number;
  hoursPerWeek: number;
}

export interface DashboardData {
  applications: ApplicationListItem[];
  counts: { byStatus: Record<ApplicationStatus, number>; total: number; active: number };
  interviewsScheduled: number;
  offers: number;
  followUps: {
    overdue: FollowUpWithApplication[];
    today: FollowUpWithApplication[];
    upcoming: FollowUpWithApplication[];
  };
  activities: ActivityWithApplication[];
  compensation: {
    /** Monthly totals of active applications, grouped by currency. */
    monthlyByCurrency: CurrencyTotal[];
    averageHourly: { currency: string; value: number }[];
    totalWeeklyHours: number;
    bands: { label: string; count: number }[];
    withRate: number;
  };
}

export async function getDashboardData(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<DashboardData> {
  const now = new Date();
  const [applications, followUps, activities, interviews] = await Promise.all([
    listApplications(supabase, userId),
    listFollowUps(supabase, userId, now),
    listRecentActivities(supabase, userId, 12),
    supabase
      .from("interviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("outcome", "pending")
      .gte("scheduled_at", now.toISOString()),
  ]);

  const counts = countByStatus(applications);
  const active = applications.filter((a) =>
    (ACTIVE_STATUSES as readonly string[]).includes(a.status),
  );

  const monthlyByCurrency = [...totalsByCurrency(active)]
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => b.count - a.count);

  const averageHourly = [...averageHourlyByCurrency(active)].map(([currency, value]) => ({
    currency,
    value,
  }));

  const bandCounts = new Map<string, number>(HOURLY_BANDS.map((b) => [b.label, 0]));
  let withRate = 0;
  let totalWeeklyHours = 0;
  for (const app of active) {
    const est = estimateForApplication(app);
    if (est.hourly !== null) {
      withRate += 1;
      const band = bandFor(est.hourly);
      bandCounts.set(band.label, (bandCounts.get(band.label) ?? 0) + 1);
    }
    if (est.monthly !== null) totalWeeklyHours += est.assumptions.hoursPerWeek;
  }

  return {
    applications,
    counts,
    interviewsScheduled: interviews.count ?? 0,
    offers: counts.byStatus.offer + counts.byStatus.hired,
    followUps: {
      overdue: followUps.filter((f) => f.bucket === "overdue"),
      today: followUps.filter((f) => f.bucket === "today"),
      upcoming: followUps.filter((f) => f.bucket === "upcoming").slice(0, 8),
    },
    activities,
    compensation: {
      monthlyByCurrency,
      averageHourly,
      totalWeeklyHours,
      bands: [...bandCounts].map(([label, count]) => ({ label, count })),
      withRate,
    },
  };
}
