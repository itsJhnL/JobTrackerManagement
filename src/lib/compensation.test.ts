import { describe, expect, it } from "vitest";

import {
  averageHourlyByCurrency,
  bandFor,
  effectiveRate,
  estimateCompensation,
  estimateForApplication,
  resolveHoursPerWeek,
  totalsByCurrency,
} from "./compensation";

describe("estimateCompensation", () => {
  it("hourly: rate × hours × 52 / 12", () => {
    const e = estimateCompensation({ rate: 25, rateType: "hourly", hoursPerWeek: 40 });
    expect(e.monthly).toBeCloseTo((25 * 40 * 52) / 12, 2);
    expect(e.annual).toBeCloseTo(25 * 40 * 52, 2);
    expect(e.hourly).toBe(25);
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
    expect(e.monthly).toBeCloseTo((25 * 20 * 52) / 12, 2);
  });

  it("hourly without hours falls back to 40h and flags it", () => {
    const e = estimateCompensation({ rate: 10, rateType: "hourly" });
    expect(e.assumptions.hoursPerWeek).toBe(40);
    expect(e.assumptions.usedDefaults).toBe(true);
    expect(e.monthly).toBeCloseTo((10 * 40 * 52) / 12, 2);
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

  it("daily: rate × days × 52 / 12", () => {
    const e = estimateCompensation({
      rate: 200,
      rateType: "daily",
      workingDaysPerWeek: 5,
      hoursPerDay: 8,
    });
    expect(e.monthly).toBeCloseTo((200 * 5 * 52) / 12, 2);
    expect(e.hourly).toBeCloseTo(25, 2);
  });

  it("weekly: rate × 52 / 12", () => {
    expect(
      estimateCompensation({ rate: 1200, rateType: "weekly", hoursPerWeek: 40 }).monthly,
    ).toBeCloseTo(5200, 2);
  });

  it("monthly: rate as-is", () => {
    expect(
      estimateCompensation({ rate: 4000, rateType: "monthly", hoursPerWeek: 40 }).monthly,
    ).toBe(4000);
  });

  it("annual: rate / 12", () => {
    const e = estimateCompensation({
      rate: 120000,
      rateType: "annual",
      hoursPerWeek: 40,
    });
    expect(e.monthly).toBe(10000);
    expect(e.annual).toBe(120000);
    expect(e.hourly).toBeCloseTo(120000 / 52 / 40, 2);
  });

  it("fixed project: one-time, no monthly", () => {
    const e = estimateCompensation({ rate: 5000, rateType: "fixed_project" });
    expect(e.monthly).toBeNull();
    expect(e.annual).toBeNull();
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
    ).toEqual({ rate: 30, source: "negotiated" });
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
    expect(totals.get("USD")?.monthly).toBeCloseTo(((10 + 20) * 40 * 52) / 12, 1);
    expect(totals.get("USD")?.count).toBe(2);
    expect(totals.get("USD")?.hoursPerWeek).toBe(80);
    expect(totals.get("PHP")?.monthly).toBeCloseTo((500 * 40 * 52) / 12, 1);
    expect(totals.has("EUR")).toBe(false);
  });

  it("averageHourlyByCurrency averages equivalent hourly rates", () => {
    const avg = averageHourlyByCurrency([
      { ...base, currency: "USD", proposed_rate: 10 },
      { ...base, currency: "USD", proposed_rate: 30, rate_type: "monthly" }, // 30/mo → tiny hourly
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
    expect(e.monthly).toBeCloseTo((100 * 3 * 52) / 12, 2);
    expect(e.source).toBe("offered");
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
