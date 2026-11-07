import type { SupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_STATUSES, type ApplicationStatus } from "@/lib/constants";
import {
  averageHourlyByCurrency,
  bandFor,
  employmentIncome,
  estimateForApplication,
  HOURLY_BANDS,
  totalsByCurrency,
} from "@/lib/compensation";
import { todayInZone } from "@/lib/timezone";

import { listRecentActivities, type ActivityWithApplication } from "./activities";
import {
  countByStatus,
  listApplications,
  type ApplicationListItem,
} from "./applications";
import {
  buildRateLookup,
  getRatesEnsuringFresh,
  type RateSnapshot,
} from "./exchange-rates";
import { listFollowUps, type FollowUpWithApplication } from "./follow-ups";
import { getIntegrationSummary, type IntegrationSummary } from "./integrations";
import { listInterviews, type InterviewWithApplication } from "./interviews";

export interface CurrencyTotal {
  currency: string;
  monthly: number;
  count: number;
  hoursPerWeek: number;
}

export type EmploymentIncome = ReturnType<typeof employmentIncome>;

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
  upcomingInterviews: InterviewWithApplication[];
  integrations: IntegrationSummary;
  /** Income from hired, active employment records, consolidated in the display currency. */
  income: EmploymentIncome;
  rates: {
    snapshot: Pick<
      RateSnapshot,
      "base" | "lastFetchedAt" | "rateDate" | "sources" | "freshness" | "label"
    >;
    /** USD→display-currency rate, for the headline "1 USD = ₱57.69" line. */
    usdToDisplay: number | null;
    error: string | null;
  };
  /** Pipeline potential (applied → offer), per original currency. Estimates only. */
  pipeline: {
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
  options: { displayCurrency: string; timeZone: string },
): Promise<DashboardData> {
  const now = new Date();
  const today = todayInZone(options.timeZone, now);

  const [
    applications,
    followUps,
    activities,
    interviews,
    ratesResult,
    allInterviews,
    integrations,
  ] = await Promise.all([
    listApplications(supabase, userId),
    listFollowUps(supabase, userId, now),
    listRecentActivities(supabase, userId, 12),
    supabase
      .from("interviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("outcome", "pending")
      .gte("scheduled_at", now.toISOString()),
    getRatesEnsuringFresh(supabase),
    listInterviews(supabase, userId),
    getIntegrationSummary(supabase, userId),
  ]);

  const counts = countByStatus(applications);
  const active = applications.filter((a) =>
    (ACTIVE_STATUSES as readonly string[]).includes(a.status),
  );

  // Employment income (hired + active), converted per job into the display currency.
  const lookup = buildRateLookup(ratesResult.snapshot);
  const income = employmentIncome(applications, options.displayCurrency, lookup, today);
  const usdToDisplay = lookup("USD", options.displayCurrency)?.rate ?? null;

  // Pipeline potential, kept separate and per currency.
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

  const { snapshot } = ratesResult;
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
    upcomingInterviews: allInterviews
      .filter(
        (i) =>
          i.outcome === "pending" && new Date(i.scheduled_at).getTime() >= now.getTime(),
      )
      .slice(0, 5),
    integrations,
    income,
    rates: {
      snapshot: {
        base: snapshot.base,
        lastFetchedAt: snapshot.lastFetchedAt,
        rateDate: snapshot.rateDate,
        sources: snapshot.sources,
        freshness: snapshot.freshness,
        label: snapshot.label,
      },
      usdToDisplay,
      error: ratesResult.error,
    },
    pipeline: {
      monthlyByCurrency,
      averageHourly,
      totalWeeklyHours,
      bands: [...bandCounts].map(([label, count]) => ({ label, count })),
      withRate,
    },
  };
}
