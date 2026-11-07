/**
 * Compensation math. One module, unit tested, used everywhere.
 *
 * Monthly estimate rules:
 *   hourly        rate × hours_per_week × 52 / 12
 *   daily         rate × working_days_per_week × 52 / 12
 *   weekly        rate × 52 / 12
 *   monthly       rate
 *   annual        rate / 12
 *   fixed_project no recurring estimate (one-time amount, shown separately)
 *
 * Rules: preserve the original currency; never add across currencies; label as estimates.
 */
import type { RateType } from "@/lib/constants";

export const WEEKS_PER_MONTH = 52 / 12;
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
  const usedDefaults = hours.usedDefault || !isPositiveNumber(input.workingDaysPerWeek);
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

  const annual = monthly * 12;
  const hourly = hours.value > 0 ? monthly / (hours.value * WEEKS_PER_MONTH) : null;

  return {
    monthly: round2(monthly),
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
 * Returns a map of currency → { total, count, hoursPerWeek }.
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
