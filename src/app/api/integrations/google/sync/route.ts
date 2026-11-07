import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { AiError } from "@/lib/ai/types";
import { getCurrentUser } from "@/lib/auth";
import { getProfile } from "@/lib/data/profiles";
import { getGoogleAccount } from "@/lib/integrations/google/client";
import { GoogleAuthError } from "@/lib/integrations/google/oauth";
import { syncCalendar, syncGmail } from "@/lib/integrations/google/sync";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/integrations/google/sync  { kind: "gmail" | "calendar" }
 *
 * A route handler rather than a server action on purpose: the App Router waits
 * for a running server action before it navigates, so a long sync used to lock
 * every link in the app. The browser calls this with plain fetch instead.
 *
 * Gmail work is split into time-boxed batches; the response says how many new
 * messages are `remaining` and the client calls again until it reaches zero.
 */
export const maxDuration = 60;

/** Stop starting new emails after this long, leaving headroom under maxDuration. */
const GMAIL_BUDGET_MS = 25_000;

const bodySchema = z.object({
  kind: z.enum(["gmail", "calendar"]),
  /** Background calendar refresh: silently skipped when not connected or synced recently. */
  auto: z.boolean().optional(),
});

/** Background calendar syncs run at most this often. */
const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;

const skipped = () => NextResponse.json({ ok: true, data: { skipped: true } });

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function describe(e: unknown) {
  if (e instanceof GoogleAuthError && e.needsReconnect)
    return "Google access was revoked or expired. Reconnect your Google account in Settings → Integrations.";
  if (e instanceof AiError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

function revalidate() {
  revalidatePath("/", "layout");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("Unauthorized", 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Unknown sync type.");
  const { kind, auto } = parsed.data;

  try {
    const supabase = await createClient();
    const account = await getGoogleAccount(supabase, user.id);
    if (auto) {
      const fresh =
        account?.last_calendar_sync_at &&
        Date.now() - Date.parse(account.last_calendar_sync_at) < AUTO_SYNC_INTERVAL_MS;
      if (
        kind !== "calendar" ||
        !account ||
        account.status === "revoked" ||
        !account.scopes.some((s) => s.includes("calendar")) ||
        fresh
      )
        return skipped();
    }
    if (!account || account.status === "revoked")
      return fail("Connect your Google account first.");

    if (kind === "gmail") {
      if (!account.scopes.some((s) => s.includes("gmail")))
        return fail(
          "Gmail access was not granted. Reconnect and allow Gmail read access.",
        );
      const profile = await getProfile(supabase, user.id);
      const r = await syncGmail(
        supabase,
        user.id,
        account,
        getAiProvider(),
        profile.default_timezone,
        { budgetMs: GMAIL_BUDGET_MS },
      );
      revalidate();
      return NextResponse.json({
        ok: true,
        data: {
          scanned: r.scanned,
          fresh: r.fresh,
          stored: r.stored,
          recruiting: r.recruiting,
          remaining: r.remaining,
          aiUnavailable: r.aiUnavailable,
          errors: r.errors,
        },
      });
    }

    if (!account.scopes.some((s) => s.includes("calendar")))
      return fail(
        "Calendar access was not granted. Reconnect and allow Calendar access.",
      );
    const r = await syncCalendar(supabase, user.id, account);
    revalidate();
    return NextResponse.json({ ok: true, data: r });
  } catch (e) {
    return fail(describe(e), 502);
  }
}
