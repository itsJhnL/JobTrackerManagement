/**
 * Compensation math. One module, unit tested, used everywhere.
 *
 * Monthly estimate rules (WEEKS_PER_MONTH = 4.33, the convention requested in
 * the product spec: 10 USD/h × 40 h/wk × 4.33 = 1,732 USD/month):
 *   hourly        rate × hours_per_week × 4.33
 *   daily         rate × working_days_per_week × 4.33
 *   weekly        rate × 4.33
 *   monthly       rate
 *   annual        rate / 12
 *   fixed_project no recurring estimate (one-time amount, shown separately)
 *
 * Rules: preserve the original currency; never add across currencies without
 * converting first; label every number as an estimate.
 */
import {
  EXCLUDED_FROM_INCOME,
  type ApplicationStatus,
  type RateType,
} from "@/lib/constants";

export const WEEKS_PER_MONTH = 4.33;
export const DEFAULT_HOURS_PER_WEEK = 40;
export const DEFAULT_WORKING_DAYS_PER_WEEK = 5;

export interface CompensationInput {
  rate: number | null | undefined;
  rateType: RateType;
  hoursPerWeek?: number | null;
  hoursPerDay?: number | null;
  /** Number of working days per week (derived from working_days[] when not given). */
  workingDaysPerWeek?: number | null;
}

export interface CompensationEstimate {
  /** Estimated recurring monthly income, or null for one-time/unknown. */
  monthly: number | null;
  /** Estimated recurring weekly income, or null. */
  weekly: number | null;
  /** Estimated recurring annual income, or null. */
  annual: number | null;
  /** Equivalent hourly rate (for comparison across rate types), or null. */
  hourly: number | null;
  /** One-time amount for fixed-project compensation. */
  oneTime: number | null;
  /** Assumptions used so the UI can label them. */
  assumptions: {
    hoursPerWeek: number;
    workingDaysPerWeek: number;
    usedDefaults: boolean;
  };
}

const EMPTY: CompensationEstimate = {
  monthly: null,
  weekly: null,
  annual: null,
  hourly: null,
  oneTime: null,
  assumptions: {
    hoursPerWeek: DEFAULT_HOURS_PER_WEEK,
    workingDaysPerWeek: DEFAULT_WORKING_DAYS_PER_WEEK,
    usedDefaults: true,
  },
};

function isPositiveNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Resolve weekly hours from explicit value, or hours/day × days/week, or default. */
export function resolveHoursPerWeek(
  input: Pick<CompensationInput, "hoursPerWeek" | "hoursPerDay" | "workingDaysPerWeek">,
) {
  if (isPositiveNumber(input.hoursPerWeek))
    return { value: input.hoursPerWeek, usedDefault: false };
  if (isPositiveNumber(input.hoursPerDay)) {
    const days = isPositiveNumber(input.workingDaysPerWeek)
      ? input.workingDaysPerWeek
      : DEFAULT_WORKING_DAYS_PER_WEEK;
    return {
      value: input.hoursPerDay * days,
      usedDefault: !isPositiveNumber(input.workingDaysPerWeek),
    };
  }
  return { value: DEFAULT_HOURS_PER_WEEK, usedDefault: true };
}

export function estimateCompensation(input: CompensationInput): CompensationEstimate {
  const rate = input.rate;
  if (!isPositiveNumber(rate)) return EMPTY;

  const hours = resolveHoursPerWeek(input);
  const workingDays = isPositiveNumber(input.workingDaysPerWeek)
    ? input.workingDaysPerWeek
    : DEFAULT_WORKING_DAYS_PER_WEEK;
  const daysAssumed = !isPositiveNumber(input.workingDaysPerWeek);
  // Only flag a default when it actually changed the estimate: hourly pay
  // depends on weekly hours, daily pay on working days, the rest on neither
  // (their hourly equivalent still uses hours, so those count too).
  const usedDefaults =
    input.rateType === "fixed_project"
      ? false
      : input.rateType === "daily"
        ? daysAssumed || hours.usedDefault
        : hours.usedDefault;
  const assumptions = {
    hoursPerWeek: hours.value,
    workingDaysPerWeek: workingDays,
    usedDefaults,
  };

  let monthly: number | null = null;
  switch (input.rateType) {
    case "hourly":
      monthly = rate * hours.value * WEEKS_PER_MONTH;
      break;
    case "daily":
      monthly = rate * workingDays * WEEKS_PER_MONTH;
      break;
    case "weekly":
      monthly = rate * WEEKS_PER_MONTH;
      break;
    case "monthly":
      monthly = rate;
      break;
    case "annual":
      monthly = rate / 12;
      break;
    case "fixed_project":
      return { ...EMPTY, oneTime: rate, assumptions };
  }

  const weekly = monthly / WEEKS_PER_MONTH;
  const annual = monthly * 12;
  const hourly = hours.value > 0 ? weekly / hours.value : null;

  return {
    monthly: round2(monthly),
    weekly: round2(weekly),
    annual: round2(annual),
    hourly: hourly === null ? null : round2(hourly),
    oneTime: null,
    assumptions,
  };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * The rate that best represents where an application currently stands:
 * negotiated → offered → proposed → null. Used for income estimates.
 */
export function effectiveRate(app: {
  negotiated_rate: number | null;
  offered_rate: number | null;
  proposed_rate: number | null;
}): { rate: number | null; source: "negotiated" | "offered" | "proposed" | null } {
  if (isPositiveNumber(app.negotiated_rate))
    return { rate: app.negotiated_rate, source: "negotiated" };
  if (isPositiveNumber(app.offered_rate))
    return { rate: app.offered_rate, source: "offered" };
  if (isPositiveNumber(app.proposed_rate))
    return { rate: app.proposed_rate, source: "proposed" };
  return { rate: null, source: null };
}

export interface ApplicationCompensationFields {
  negotiated_rate: number | null;
  offered_rate: number | null;
  proposed_rate: number | null;
  rate_type: RateType;
  hours_per_week: number | null;
  hours_per_day: number | null;
  working_days: string[];
  currency: string;
}

export function estimateForApplication(app: ApplicationCompensationFields) {
  const { rate, source } = effectiveRate(app);
  const estimate = estimateCompensation({
    rate,
    rateType: app.rate_type,
    hoursPerWeek: app.hours_per_week,
    hoursPerDay: app.hours_per_day,
    workingDaysPerWeek: app.working_days.length > 0 ? app.working_days.length : null,
  });
  return { ...estimate, source, currency: app.currency };
}

/**
 * Groups monthly estimates by currency. Never sums across currencies.
 * Returns a map of currency → { monthly, count, hoursPerWeek }.
 */
export function totalsByCurrency(apps: ApplicationCompensationFields[]) {
  const totals = new Map<
    string,
    { monthly: number; count: number; hoursPerWeek: number }
  >();
  for (const app of apps) {
    const est = estimateForApplication(app);
    if (est.monthly === null) continue;
    const entry = totals.get(app.currency) ?? { monthly: 0, count: 0, hoursPerWeek: 0 };
    entry.monthly = round2(entry.monthly + est.monthly);
    entry.count += 1;
    entry.hoursPerWeek += est.assumptions.hoursPerWeek;
    totals.set(app.currency, entry);
  }
  return totals;
}

/** Average of equivalent hourly rates, per currency. */
export function averageHourlyByCurrency(apps: ApplicationCompensationFields[]) {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const app of apps) {
    const est = estimateForApplication(app);
    if (est.hourly === null) continue;
    const entry = acc.get(app.currency) ?? { sum: 0, count: 0 };
    entry.sum += est.hourly;
    entry.count += 1;
    acc.set(app.currency, entry);
  }
  return new Map([...acc].map(([c, { sum, count }]) => [c, round2(sum / count)]));
}

// ---------------------------------------------------------------------------
// Employment income: only hired + active employment records contribute.
// ---------------------------------------------------------------------------

export interface EmploymentFields extends ApplicationCompensationFields {
  id: string;
  company_name: string;
  job_title: string;
  status: ApplicationStatus;
  employment_active: boolean;
  employment_ended_at: string | null;
  archived_at: string | null;
}

/** True when the record is an active employment that earns recurring income. */
export function isActiveEmployment(app: EmploymentFields, today?: string) {
  if (app.status !== "hired") return false;
  if (!app.employment_active) return false;
  if (app.archived_at) return false;
  if (app.employment_ended_at && today && app.employment_ended_at < today) return false;
  return !EXCLUDED_FROM_INCOME.includes(app.status);
}

export interface JobIncome {
  id: string;
  company_name: string;
  job_title: string;
  currency: string;
  rate: number | null;
  rateSource: "negotiated" | "offered" | "proposed" | null;
  rateType: RateType;
  hoursPerWeek: number;
  usedDefaults: boolean;
  /** In the job's own currency. */
  monthly: number | null;
  weekly: number | null;
  oneTime: number | null;
  /** In the display currency, when a rate was available. */
  converted: { monthly: number; weekly: number; rate: number; rateDate: string } | null;
}

export interface ExchangeRateLookup {
  /** Rate to multiply an amount in `from` to get `to`; null when unknown. */
  (from: string, to: string): { rate: number; rateDate: string } | null;
}

/**
 * Per-job breakdown and the consolidated total in `displayCurrency`.
 * Each job is calculated in its own currency first and converted separately;
 * jobs without a rate or without a known exchange rate are listed but excluded
 * from the consolidated total (and reported in `unconverted`).
 */
export function employmentIncome(
  apps: EmploymentFields[],
  displayCurrency: string,
  lookupRate: ExchangeRateLookup,
  today?: string,
) {
  const seen = new Set<string>();
  const jobs: JobIncome[] = [];
  for (const app of apps) {
    if (!isActiveEmployment(app, today)) continue;
    if (seen.has(app.id)) continue; // never count the same employment twice
    seen.add(app.id);

    const est = estimateForApplication(app);
    let converted: JobIncome["converted"] = null;
    if (est.monthly !== null && est.weekly !== null) {
      if (app.currency === displayCurrency) {
        converted = {
          monthly: est.monthly,
          weekly: est.weekly,
          rate: 1,
          rateDate: today ?? "",
        };
      } else {
        const fx = lookupRate(app.currency, displayCurrency);
        if (fx)
          converted = {
            monthly: round2(est.monthly * fx.rate),
            weekly: round2(est.weekly * fx.rate),
            rate: fx.rate,
            rateDate: fx.rateDate,
          };
      }
    }
    jobs.push({
      id: app.id,
      company_name: app.company_name,
      job_title: app.job_title,
      currency: app.currency,
      rate: effectiveRate(app).rate,
      rateSource: est.source,
      rateType: app.rate_type,
      hoursPerWeek: est.assumptions.hoursPerWeek,
      usedDefaults: est.assumptions.usedDefaults,
      monthly: est.monthly,
      weekly: est.weekly,
      oneTime: est.oneTime,
      converted,
    });
  }

  const totalMonthly = round2(jobs.reduce((n, j) => n + (j.converted?.monthly ?? 0), 0));
  const totalWeekly = round2(jobs.reduce((n, j) => n + (j.converted?.weekly ?? 0), 0));
  const totalHours = jobs.reduce(
    (n, j) => n + (j.monthly !== null ? j.hoursPerWeek : 0),
    0,
  );
  const unconverted = jobs.filter((j) => j.monthly !== null && j.converted === null);
  const originals = totalsByCurrency(apps.filter((a) => isActiveEmployment(a, today)));

  return {
    displayCurrency,
    jobs,
    totalMonthly,
    totalWeekly,
    totalHours,
    unconverted,
    /** Monthly totals per original currency (never summed together). */
    byCurrency: [...originals].map(([currency, v]) => ({ currency, ...v })),
  };
}

/** Rate bands for "applications by compensation range" (equivalent hourly). */
export const HOURLY_BANDS = [
  { label: "< 10", min: 0, max: 10 },
  { label: "10–20", min: 10, max: 20 },
  { label: "20–35", min: 20, max: 35 },
  { label: "35–50", min: 35, max: 50 },
  { label: "50–75", min: 50, max: 75 },
  { label: "75+", min: 75, max: Infinity },
] as const;

export function bandFor(hourly: number) {
  return (
    HOURLY_BANDS.find((b) => hourly >= b.min && hourly < b.max) ??
    HOURLY_BANDS[HOURLY_BANDS.length - 1]
  );
}
