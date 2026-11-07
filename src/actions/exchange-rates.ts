"use server";

import { revalidatePath } from "next/cache";

import { fail, fromUnknownError, ok, type ActionResult } from "@/lib/action-result";
import { requireUserForAction } from "@/lib/auth";
import { refreshExchangeRates } from "@/lib/data/exchange-rates";

/** Manual "Refresh rates" from the dashboard. Always hits the providers. */
export async function refreshRatesNow(): Promise<
  ActionResult<{
    rateDate: string | null;
    fetchedAt: string | null;
    sources: string[];
    warnings: string[];
  }>
> {
  try {
    const { supabase } = await requireUserForAction();
    const { snapshot, errors } = await refreshExchangeRates(supabase, { force: true });
    revalidatePath("/dashboard");
    revalidatePath("/applications/compare");
    if (snapshot.rates.size === 0)
      return fail(
        "No exchange-rate provider responded. The last valid rates are still in use.",
      );
    return ok({
      rateDate: snapshot.rateDate,
      fetchedAt: snapshot.lastFetchedAt,
      sources: snapshot.sources,
      warnings: errors.map((e) => `${e.source}: ${e.message}`),
    });
  } catch (e) {
    return fromUnknownError(
      e,
      "Exchange rates are temporarily unavailable. The last valid rates are still in use.",
    );
  }
}
