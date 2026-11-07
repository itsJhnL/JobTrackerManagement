import { describe, expect, it } from "vitest";

import {
  averageHourlyByCurrency,
  bandFor,
  effectiveRate,
  employmentIncome,
  estimateCompensation,
  estimateForApplication,
  isActiveEmployment,
  resolveHoursPerWeek,
  totalsByCurrency,
  WEEKS_PER_MONTH,
  type EmploymentFields,
} from "./compensation";

describe("estimateCompensation", () => {
  it("uses the 4.33 weeks-per-month convention: $10 × 40h = $1,732", () => {
    expect(WEEKS_PER_MONTH).toBe(4.33);
    const e = estimateCompensation({ rate: 10, rateType: "hourly", hoursPerWeek: 40 });
    expect(e.monthly).toBe(1732);
    expect(e.weekly).toBe(400);
    expect(e.annual).toBe(20784);
    expect(e.hourly).toBe(10);
  });

  it("hourly: rate × hours × 4.33", () => {
    const e = estimateCompensation({ rate: 25, rateType: "hourly", hoursPerWeek: 40 });
    expect(e.monthly).toBeCloseTo(25 * 40 * 4.33, 2);
    expect(e.oneTime).toBeNull();
    expect(e.assumptions.usedDefaults).toBe(true); // working days defaulted
  });

  it("hourly with explicit hours and days marks no defaults", () => {
    const e = estimateCompensation({
      rate: 25,
      rateType: "hourly",
      hoursPerWeek: 20,
      workingDaysPerWeek: 5,
    });
    expect(e.assumptions.usedDefaults).toBe(false);
    expect(e.monthly).toBeCloseTo(25 * 20 * 4.33, 2);
  });

  it("hourly without hours falls back to 40h and flags it", () => {
    const e = estimateCompensation({ rate: 10, rateType: "hourly" });
    expect(e.assumptions.hoursPerWeek).toBe(40);
    expect(e.assumptions.usedDefaults).toBe(true);
    expect(e.monthly).toBe(1732);
  });

  it("derives weekly hours from hours/day × days/week", () => {
    expect(resolveHoursPerWeek({ hoursPerDay: 8, workingDaysPerWeek: 4 })).toEqual({
      value: 32,
      usedDefault: false,
    });
    expect(resolveHoursPerWeek({ hoursPerDay: 8 })).toEqual({
      value: 40,
      usedDefault: true,
    });
  });

  it("daily: rate × days × 4.33", () => {
    const e = estimateCompensation({
      rate: 200,
      rateType: "daily",
      workingDaysPerWeek: 5,
      hoursPerDay: 8,
    });
    expect(e.monthly).toBeCloseTo(200 * 5 * 4.33, 2);
    expect(e.hourly).toBeCloseTo(25, 2);
  });

  it("weekly: rate × 4.33", () => {
    expect(
      estimateCompensation({ rate: 1200, rateType: "weekly", hoursPerWeek: 40 }).monthly,
    ).toBeCloseTo(5196, 2);
  });

  it("monthly: rate as-is; weekly derived", () => {
    const e = estimateCompensation({ rate: 4330, rateType: "monthly", hoursPerWeek: 40 });
    expect(e.monthly).toBe(4330);
    expect(e.weekly).toBe(1000);
  });

  it("annual: rate / 12", () => {
    const e = estimateCompensation({
      rate: 120000,
      rateType: "annual",
      hoursPerWeek: 40,
    });
    expect(e.monthly).toBe(10000);
    expect(e.annual).toBe(120000);
    expect(e.hourly).toBeCloseTo(10000 / 4.33 / 40, 2);
  });

  it("fixed project: one-time, no monthly", () => {
    const e = estimateCompensation({ rate: 5000, rateType: "fixed_project" });
    expect(e.monthly).toBeNull();
    expect(e.weekly).toBeNull();
    expect(e.oneTime).toBe(5000);
  });

  it("returns empty estimate for missing or invalid rate", () => {
    expect(estimateCompensation({ rate: null, rateType: "hourly" }).monthly).toBeNull();
    expect(estimateCompensation({ rate: 0, rateType: "hourly" }).monthly).toBeNull();
    expect(estimateCompensation({ rate: -5, rateType: "hourly" }).monthly).toBeNull();
    expect(
      estimateCompensation({ rate: Number.NaN, rateType: "hourly" }).monthly,
    ).toBeNull();
  });
});

describe("effectiveRate", () => {
  it("prefers negotiated, then offered, then proposed", () => {
    expect(
      effectiveRate({ negotiated_rate: 30, offered_rate: 25, proposed_rate: 35 }),
    ).toEqual({
      rate: 30,
      source: "negotiated",
    });
    expect(
      effectiveRate({ negotiated_rate: null, offered_rate: 25, proposed_rate: 35 }),
    ).toEqual({ rate: 25, source: "offered" });
    expect(
      effectiveRate({ negotiated_rate: null, offered_rate: null, proposed_rate: 35 }),
    ).toEqual({ rate: 35, source: "proposed" });
    expect(
      effectiveRate({ negotiated_rate: null, offered_rate: null, proposed_rate: null }),
    ).toEqual({ rate: null, source: null });
  });
});

const base = {
  negotiated_rate: null,
  offered_rate: null,
  proposed_rate: null,
  rate_type: "hourly" as const,
  hours_per_week: 40,
  hours_per_day: null,
  working_days: ["mon", "tue", "wed", "thu", "fri"],
};

describe("aggregates never mix currencies", () => {
  it("totalsByCurrency groups by currency", () => {
    const totals = totalsByCurrency([
      { ...base, currency: "USD", proposed_rate: 10 },
      { ...base, currency: "USD", offered_rate: 20 },
      { ...base, currency: "PHP", proposed_rate: 500 },
      { ...base, currency: "EUR", rate_type: "fixed_project", proposed_rate: 1000 }, // excluded
    ]);
    expect(totals.get("USD")?.monthly).toBeCloseTo((10 + 20) * 40 * 4.33, 1);
    expect(totals.get("USD")?.count).toBe(2);
    expect(totals.get("USD")?.hoursPerWeek).toBe(80);
    expect(totals.get("PHP")?.monthly).toBeCloseTo(500 * 40 * 4.33, 1);
    expect(totals.has("EUR")).toBe(false);
  });

  it("averageHourlyByCurrency averages equivalent hourly rates", () => {
    const avg = averageHourlyByCurrency([
      { ...base, currency: "USD", proposed_rate: 10 },
      { ...base, currency: "USD", proposed_rate: 30, rate_type: "monthly" },
      { ...base, currency: "AUD", proposed_rate: 50 },
    ]);
    expect(avg.get("AUD")).toBe(50);
    const usd = avg.get("USD")!;
    expect(usd).toBeGreaterThan(5);
    expect(usd).toBeLessThan(10);
  });

  it("estimateForApplication uses working_days length as days/week", () => {
    const e = estimateForApplication({
      ...base,
      currency: "USD",
      rate_type: "daily",
      offered_rate: 100,
      working_days: ["mon", "wed", "fri"],
      hours_per_week: null,
    });
    expect(e.monthly).toBeCloseTo(100 * 3 * 4.33, 2);
    expect(e.source).toBe("offered");
  });
});

const job = (over: Partial<EmploymentFields>): EmploymentFields => ({
  ...base,
  id: over.id ?? "a",
  company_name: "Acme",
  job_title: "Dev",
  status: "hired",
  employment_active: true,
  employment_ended_at: null,
  archived_at: null,
  currency: "USD",
  ...over,
});

const rates = (from: string, to: string) =>
  from === "USD" && to === "PHP"
    ? { rate: 57.69, rateDate: "2026-11-06" }
    : from === "EUR" && to === "PHP"
      ? { rate: 62, rateDate: "2026-11-06" }
      : null;

describe("employment income", () => {
  it("only hired + active employment counts", () => {
    expect(isActiveEmployment(job({ status: "offer" }))).toBe(false);
    expect(isActiveEmployment(job({ status: "rejected" }))).toBe(false);
    expect(isActiveEmployment(job({ status: "withdrawn" }))).toBe(false);
    expect(isActiveEmployment(job({ employment_active: false }))).toBe(false);
    expect(isActiveEmployment(job({ archived_at: "2026-01-01T00:00:00Z" }))).toBe(false);
    expect(
      isActiveEmployment(job({ employment_ended_at: "2026-01-01" }), "2026-11-06"),
    ).toBe(false);
    expect(
      isActiveEmployment(job({ employment_ended_at: "2026-12-01" }), "2026-11-06"),
    ).toBe(true);
    expect(isActiveEmployment(job({}))).toBe(true);
  });

  it("converts each job separately and sums in PHP: $1,732 × 57.69 = ₱99,919.08", () => {
    const r = employmentIncome([job({ negotiated_rate: 10 })], "PHP", rates);
    expect(r.jobs).toHaveLength(1);
    expect(r.jobs[0].monthly).toBe(1732);
    expect(r.jobs[0].converted?.monthly).toBe(99919.08);
    expect(r.jobs[0].converted?.rate).toBe(57.69);
    expect(r.totalMonthly).toBe(99919.08);
    expect(r.totalWeekly).toBe(23076);
  });

  it("supports multiple simultaneous jobs in different currencies", () => {
    const r = employmentIncome(
      [
        job({ id: "a", negotiated_rate: 10, hours_per_week: 40 }), // 1732 USD
        job({ id: "b", offered_rate: 8, hours_per_week: 20 }), // 692.8 USD
        job({ id: "c", proposed_rate: 20, hours_per_week: 10, currency: "EUR" }), // 866 EUR
        job({ id: "d", proposed_rate: 500, hours_per_week: 40, currency: "PHP" }), // 86600 PHP, no conversion
      ],
      "PHP",
      rates,
    );
    expect(r.jobs).toHaveLength(4);
    const expected = 1732 * 57.69 + 692.8 * 57.69 + 866 * 62 + 86600;
    expect(r.totalMonthly).toBeCloseTo(expected, 1);
    expect(r.totalHours).toBe(110);
    expect(r.byCurrency.find((c) => c.currency === "USD")?.monthly).toBeCloseTo(
      2424.8,
      1,
    );
    expect(r.unconverted).toHaveLength(0);
  });

  it("never counts the same employment twice", () => {
    const a = job({ negotiated_rate: 10 });
    const r = employmentIncome([a, a], "PHP", rates);
    expect(r.jobs).toHaveLength(1);
  });

  it("lists jobs without a known rate as unconverted and excludes them from the total", () => {
    const r = employmentIncome(
      [job({ negotiated_rate: 10, currency: "GBP" })],
      "PHP",
      rates,
    );
    expect(r.jobs[0].converted).toBeNull();
    expect(r.unconverted).toHaveLength(1);
    expect(r.totalMonthly).toBe(0);
  });

  it("skips jobs without any rate", () => {
    const r = employmentIncome([job({})], "PHP", rates);
    expect(r.jobs[0].monthly).toBeNull();
    expect(r.totalMonthly).toBe(0);
    expect(r.unconverted).toHaveLength(0);
  });
});

describe("bandFor", () => {
  it("maps hourly rates to bands", () => {
    expect(bandFor(5).label).toBe("< 10");
    expect(bandFor(10).label).toBe("10–20");
    expect(bandFor(49.99).label).toBe("35–50");
    expect(bandFor(500).label).toBe("75+");
  });
});
