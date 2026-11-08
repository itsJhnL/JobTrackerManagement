import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { ExchangeRateRow } from "@/lib/supabase/database.types";
import { CURRENCIES } from "@/lib/constants";
import type { ExchangeRateLookup } from "@/lib/compensation";

import {
  describeFreshness,
  fetchRatesWithFallback,
  type RateFreshness,
} from "@/lib/fx/providers";

/**
 * Exchange rates are stored with a single base (USD) for every supported
 * currency, one row per quote per rate-date per source (history preserved).
 * Any pair is derived as rate(A→B) = rate(USD→B) / rate(USD→A).
 */
export const RATE_BASE = "USD";

/** Consider cached rates fresh enough to skip a provider call for this long. */
export const RATE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Minimum gap between automatic provider calls from this server instance.
 * Over weekends the providers keep returning a rate date we already stored,
 * so the stored fetched_at does not move; this stops every page load from
 * calling the providers again.
 */
const AUTO_REFRESH_COOLDOWN_MS = 60 * 60 * 1000;
let lastAutoRefreshAt = 0;

/** Message from an Error or a Supabase/PostgREST error object. */
function errorMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string")
    return e.message;
  return fallback;
}

export interface LatestRate {
  quote: string;
  rate: number;
  rateDate: string;
  source: string;
  fetchedAt: string;
  providerUpdatedAt: string | null;
}

export interface RateSnapshot {
  base: string;
  rates: Map<string, LatestRate>;
  /** Most recent fetch across all pairs. */
  lastFetchedAt: string | null;
  /** Oldest rate date among the pairs in use (the honest "as of"). */
  rateDate: string | null;
  sources: string[];
  freshness: RateFreshness;
  label: string;
}

/** Latest stored rate per quote currency (base USD). */
export async function getLatestRates(
  supabase: SupabaseServerClient,
): Promise<RateSnapshot> {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("*")
    .eq("base_currency", RATE_BASE)
    .order("rate_date", { ascending: false })
    .order("fetched_at", { ascending: false })
    .limit(400);
  if (error) throw error;
  return snapshotFromRows(data ?? []);
}

export function snapshotFromRows(rows: ExchangeRateRow[]): RateSnapshot {
  const rates = new Map<string, LatestRate>();
  for (const r of rows) {
    if (rates.has(r.quote_currency)) continue; // rows are newest-first
    rates.set(r.quote_currency, {
      quote: r.quote_currency,
      rate: Number(r.rate),
      rateDate: r.rate_date,
      source: r.source,
      fetchedAt: r.fetched_at,
      providerUpdatedAt: r.provider_updated_at,
    });
  }
  const list = [...rates.values()];
  const lastFetchedAt = list.length
    ? list
        .map((r) => r.fetchedAt)
        .sort()
        .at(-1)!
    : null;
  const rateDate = list.length ? list.map((r) => r.rateDate).sort()[0] : null;
  const { freshness, label } = describeFreshness(rateDate, lastFetchedAt);
  return {
    base: RATE_BASE,
    rates,
    lastFetchedAt,
    rateDate,
    sources: [...new Set(list.map((r) => r.source))],
    freshness,
    label,
  };
}

export function isRefreshDue(snapshot: RateSnapshot, now: Date = new Date()) {
  if (!snapshot.lastFetchedAt) return true;
  if (snapshot.rates.size < CURRENCIES.length - 1) return true;
  return (
    now.getTime() - new Date(snapshot.lastFetchedAt).getTime() > RATE_REFRESH_INTERVAL_MS
  );
}

/**
 * Fetches current rates from the providers and appends them to the table.
 * Existing (base, quote, date, source) rows are left untouched, so a refresh
 * on the same day is idempotent. Returns the fresh snapshot.
 */
export async function refreshExchangeRates(
  supabase: SupabaseServerClient,
  options: { force?: boolean } = {},
): Promise<{
  snapshot: RateSnapshot;
  refreshed: boolean;
  errors: { source: string; message: string }[];
}> {
  const current = await getLatestRates(supabase);
  if (
    !options.force &&
    (!isRefreshDue(current) || Date.now() - lastAutoRefreshAt < AUTO_REFRESH_COOLDOWN_MS)
  )
    return { snapshot: current, refreshed: false, errors: [] };
  if (!options.force) lastAutoRefreshAt = Date.now();

  const symbols = CURRENCIES.filter((c) => c !== RATE_BASE);
  const { results, errors } = await fetchRatesWithFallback(RATE_BASE, symbols);

  const rows = results.flatMap((r) =>
    Object.entries(r.rates).map(([quote, rate]) => ({
      base_currency: RATE_BASE,
      quote_currency: quote,
      rate,
      rate_date: r.rateDate,
      source: r.source,
      provider_updated_at: r.providerUpdatedAt,
      fetched_at: r.fetchedAt,
    })),
  );

  if (rows.length) {
    // Insert-only: RLS allows inserts but not updates (history is append-only),
    // so a rate we already stored for that date and source is simply skipped.
    // Updating it would be rejected by RLS.
    const { error } = await supabase.from("exchange_rates").upsert(rows, {
      onConflict: "base_currency,quote_currency,rate_date,source",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }

  const snapshot = await getLatestRates(supabase);
  return { snapshot, refreshed: true, errors };
}

/**
 * Best effort: returns stored rates, refreshing first when they are due.
 * Never throws because of the provider; a provider failure keeps the last
 * valid rates and is reported in `error`.
 */
export async function getRatesEnsuringFresh(
  supabase: SupabaseServerClient,
): Promise<{ snapshot: RateSnapshot; error: string | null }> {
  try {
    const { snapshot, errors } = await refreshExchangeRates(supabase);
    return {
      snapshot,
      error:
        errors.length && snapshot.rates.size === 0
          ? errors.map((e) => e.message).join("; ")
          : null,
    };
  } catch (e) {
    const snapshot = await getLatestRates(supabase).catch(() => snapshotFromRows([]));
    return {
      snapshot,
      error: errorMessage(e, "Exchange rates temporarily unavailable"),
    };
  }
}

/** Lookup for compensation.employmentIncome: A→B through the USD base. */
export function buildRateLookup(snapshot: RateSnapshot): ExchangeRateLookup {
  return (from, to) => {
    if (from === to) return { rate: 1, rateDate: snapshot.rateDate ?? "" };
    const usdTo =
      to === RATE_BASE
        ? { rate: 1, rateDate: snapshot.rateDate ?? "" }
        : snapshot.rates.get(to);
    const usdFrom =
      from === RATE_BASE
        ? { rate: 1, rateDate: snapshot.rateDate ?? "" }
        : snapshot.rates.get(from);
    if (!usdTo || !usdFrom) return null;
    return {
      rate: usdTo.rate / usdFrom.rate,
      rateDate: [usdTo.rateDate, usdFrom.rateDate].sort()[0],
    };
  };
}

/** Historical rows for analytics (USD base), newest first. */
export async function listRateHistory(
  supabase: SupabaseServerClient,
  quote: string,
  limit = 90,
) {
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("rate, rate_date, source, fetched_at")
    .eq("base_currency", RATE_BASE)
    .eq("quote_currency", quote)
    .order("rate_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
