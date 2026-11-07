/**
 * Exchange-rate providers. No API keys, no hardcoded rates.
 *
 * - frankfurter  : European Central Bank reference rates via api.frankfurter.app.
 *                  Updated once per working day (around 16:00 CET). Supports PHP.
 * - exchangerate-api : open.er-api.com free endpoint. Updated daily; the
 *                  response carries its own last/next update timestamps.
 *
 * The primary provider is tried first; on failure or missing currencies the
 * secondary fills in. Everything returned is labelled with its source and the
 * provider's own rate date so the UI never calls a daily rate "live".
 */

export interface FetchedRates {
  source: string;
  base: string;
  /** Provider's rate date (YYYY-MM-DD). */
  rateDate: string;
  /** When the provider says the rates were published, if known. */
  providerUpdatedAt: string | null;
  /** Provider's stated next update, if known. */
  providerNextUpdateAt: string | null;
  rates: Record<string, number>;
  fetchedAt: string;
}

export interface RateProvider {
  readonly name: string;
  readonly description: string;
  /** Quotes `symbols` against `base`. May return fewer symbols than asked. */
  fetchLatest(
    base: string,
    symbols: string[],
    signal?: AbortSignal,
  ): Promise<FetchedRates>;
}

const TIMEOUT_MS = 10_000;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const frankfurterProvider: RateProvider = {
  name: "frankfurter",
  description:
    "European Central Bank reference rates (frankfurter.app), updated once per working day",
  async fetchLatest(base, symbols, signal) {
    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${symbols.map(encodeURIComponent).join(",")}`;
    const json = await getJson<{
      base: string;
      date: string;
      rates: Record<string, number>;
    }>(url, signal);
    if (!json.rates || typeof json.date !== "string")
      throw new Error("frankfurter: unexpected response");
    return {
      source: this.name,
      base: json.base,
      rateDate: json.date,
      providerUpdatedAt: null,
      providerNextUpdateAt: null,
      rates: json.rates,
      fetchedAt: new Date().toISOString(),
    };
  },
};

export const exchangeRateApiProvider: RateProvider = {
  name: "exchangerate-api",
  description: "ExchangeRate-API open endpoint (open.er-api.com), updated daily",
  async fetchLatest(base, symbols, signal) {
    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
    const json = await getJson<{
      result: string;
      base_code: string;
      time_last_update_unix?: number;
      time_next_update_unix?: number;
      rates: Record<string, number>;
    }>(url, signal);
    if (json.result !== "success" || !json.rates)
      throw new Error("exchangerate-api: unexpected response");
    const updated = json.time_last_update_unix
      ? new Date(json.time_last_update_unix * 1000)
      : new Date();
    const wanted = new Set(symbols);
    return {
      source: this.name,
      base: json.base_code,
      rateDate: updated.toISOString().slice(0, 10),
      providerUpdatedAt: updated.toISOString(),
      providerNextUpdateAt: json.time_next_update_unix
        ? new Date(json.time_next_update_unix * 1000).toISOString()
        : null,
      rates: Object.fromEntries(
        Object.entries(json.rates).filter(([k]) => wanted.has(k)),
      ),
      fetchedAt: new Date().toISOString(),
    };
  },
};

export const RATE_PROVIDERS: RateProvider[] = [
  frankfurterProvider,
  exchangeRateApiProvider,
];

/**
 * Fetches `symbols` against `base`, trying providers in order and merging
 * so that every requested symbol comes from the first provider that has it.
 * Throws only when no provider returned anything.
 */
export async function fetchRatesWithFallback(
  base: string,
  symbols: string[],
  providers: RateProvider[] = RATE_PROVIDERS,
): Promise<{ results: FetchedRates[]; errors: { source: string; message: string }[] }> {
  const results: FetchedRates[] = [];
  const errors: { source: string; message: string }[] = [];
  let missing = symbols.filter((s) => s !== base);

  for (const provider of providers) {
    if (missing.length === 0) break;
    try {
      const r = await provider.fetchLatest(base, missing);
      const got = Object.keys(r.rates).filter((k) => missing.includes(k));
      if (got.length) {
        results.push({
          ...r,
          rates: Object.fromEntries(got.map((k) => [k, r.rates[k]])),
        });
        missing = missing.filter((s) => !got.includes(s));
      }
    } catch (e) {
      errors.push({
        source: provider.name,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (results.length === 0) {
    throw new Error(
      errors.map((e) => `${e.source}: ${e.message}`).join("; ") ||
        "No exchange-rate provider responded",
    );
  }
  return { results, errors };
}

export type RateFreshness = "fresh" | "stale" | "unavailable";

/**
 * Human label for how current a cached rate is. Daily providers are "fresh"
 * for 36 hours after the provider's rate date to cover weekends and holidays
 * without lying about liveness; the label always says it is a cached rate.
 */
export function describeFreshness(
  rateDate: string | null,
  fetchedAt: string | null,
  now: Date = new Date(),
): { freshness: RateFreshness; label: string } {
  if (!rateDate || !fetchedAt)
    return { freshness: "unavailable", label: "Exchange rate unavailable" };
  const fetched = new Date(fetchedAt).getTime();
  const ageMin = Math.max(0, Math.round((now.getTime() - fetched) / 60_000));
  const rateAgeHours =
    (now.getTime() - new Date(`${rateDate}T00:00:00Z`).getTime()) / 3_600_000;
  const freshness: RateFreshness = rateAgeHours <= 36 + 24 ? "fresh" : "stale";
  let when: string;
  if (ageMin < 1) when = "Updated just now";
  else if (ageMin < 60) when = `Updated ${ageMin} minute${ageMin === 1 ? "" : "s"} ago`;
  else if (ageMin < 24 * 60)
    when = `Updated ${Math.round(ageMin / 60)} hour${Math.round(ageMin / 60) === 1 ? "" : "s"} ago`;
  else
    when = `Updated ${Math.round(ageMin / 1440)} day${Math.round(ageMin / 1440) === 1 ? "" : "s"} ago`;
  return {
    freshness,
    label:
      freshness === "fresh"
        ? `${when} · cached daily rate for ${rateDate}`
        : `Cached rate from ${rateDate} (may be outdated)`,
  };
}
