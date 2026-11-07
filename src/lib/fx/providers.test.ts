import { describe, expect, it } from "vitest";

import {
  describeFreshness,
  fetchRatesWithFallback,
  type RateProvider,
} from "./providers";

const fake = (
  name: string,
  rates: Record<string, number> | Error,
  date = "2026-11-06",
): RateProvider => ({
  name,
  description: name,
  async fetchLatest(base) {
    if (rates instanceof Error) throw rates;
    return {
      source: name,
      base,
      rateDate: date,
      providerUpdatedAt: null,
      providerNextUpdateAt: null,
      rates,
      fetchedAt: "2026-11-06T10:00:00.000Z",
    };
  },
});

describe("fetchRatesWithFallback", () => {
  it("uses the primary provider when it has every symbol", async () => {
    const { results, errors } = await fetchRatesWithFallback(
      "USD",
      ["PHP", "EUR"],
      [fake("a", { PHP: 57, EUR: 0.9 }), fake("b", { PHP: 99, EUR: 9 })],
    );
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("a");
    expect(errors).toHaveLength(0);
  });

  it("fills missing symbols from the secondary provider", async () => {
    const { results } = await fetchRatesWithFallback(
      "USD",
      ["PHP", "AED"],
      [
        fake("a", { PHP: 57 }), // ECB has no AED
        fake("b", { PHP: 58, AED: 3.67 }),
      ],
    );
    expect(results.map((r) => r.source)).toEqual(["a", "b"]);
    expect(results[1].rates).toEqual({ AED: 3.67 });
  });

  it("falls back when the primary fails and reports the error", async () => {
    const { results, errors } = await fetchRatesWithFallback(
      "USD",
      ["PHP"],
      [fake("a", new Error("HTTP 503")), fake("b", { PHP: 58 })],
    );
    expect(results[0].source).toBe("b");
    expect(errors).toEqual([{ source: "a", message: "HTTP 503" }]);
  });

  it("throws when nobody responds", async () => {
    await expect(
      fetchRatesWithFallback(
        "USD",
        ["PHP"],
        [fake("a", new Error("down")), fake("b", new Error("down too"))],
      ),
    ).rejects.toThrow(/a: down; b: down too/);
  });

  it("never asks for the base itself", async () => {
    const { results } = await fetchRatesWithFallback(
      "USD",
      ["USD", "PHP"],
      [fake("a", { PHP: 57 })],
    );
    expect(Object.keys(results[0].rates)).toEqual(["PHP"]);
  });
});

describe("describeFreshness", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  it("labels recent cached rates honestly", () => {
    expect(describeFreshness("2026-11-06", "2026-11-06T11:59:40Z", now)).toMatchObject({
      freshness: "fresh",
      label: "Updated just now · cached daily rate for 2026-11-06",
    });
    expect(describeFreshness("2026-11-06", "2026-11-06T11:55:00Z", now).label).toMatch(
      /^Updated 5 minutes ago/,
    );
    expect(describeFreshness("2026-11-05", "2026-11-06T09:00:00Z", now).label).toMatch(
      /^Updated 3 hours ago/,
    );
  });
  it("flags old rates as cached and possibly outdated", () => {
    const r = describeFreshness("2026-10-20", "2026-10-20T12:00:00Z", now);
    expect(r.freshness).toBe("stale");
    expect(r.label).toMatch(/Cached rate from 2026-10-20/);
  });
  it("handles missing rates", () => {
    expect(describeFreshness(null, null, now)).toEqual({
      freshness: "unavailable",
      label: "Exchange rate unavailable",
    });
  });
});
