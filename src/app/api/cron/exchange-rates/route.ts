import { NextResponse, type NextRequest } from "next/server";

import { refreshExchangeRates } from "@/lib/data/exchange-rates";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Scheduled refresh of exchange rates (see vercel.json: daily at 06:15 UTC,
 * after the ECB publishes and after exchangerate-api's daily update).
 *
 * Protected by CRON_SECRET: Vercel sends it as a Bearer token. Writes with the
 * service-role client because no user session exists during a cron run.
 * Run manually with:  curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/exchange-rates
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured; scheduled refresh is disabled. Rates still refresh lazily when a user opens the dashboard.",
      },
      { status: 503 },
    );
  }

  try {
    const { snapshot, refreshed, errors } = await refreshExchangeRates(admin, {
      force: true,
    });
    return NextResponse.json({
      ok: snapshot.rates.size > 0,
      refreshed,
      rateDate: snapshot.rateDate,
      fetchedAt: snapshot.lastFetchedAt,
      sources: snapshot.sources,
      pairs: snapshot.rates.size,
      warnings: errors,
    });
  } catch (e) {
    console.error("[cron] exchange rates", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Refresh failed" },
      { status: 502 },
    );
  }
}
