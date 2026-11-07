import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/data/activities";
import { encryptSecret, verifyState } from "@/lib/integrations/google/crypto";
import {
  exchangeCode,
  fetchUserEmail,
  GoogleAuthError,
} from "@/lib/integrations/google/oauth";
import { createClient } from "@/lib/supabase/server";

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("tab", "integrations");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/** OAuth redirect target. Exchanges the code, stores encrypted tokens, never exposes them. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const params = request.nextUrl.searchParams;
  if (params.get("error"))
    return back(request, {
      error: params.get("error") === "access_denied" ? "denied" : "google_error",
    });

  const state = verifyState<{ uid: string; features: string }>(params.get("state"));
  const code = params.get("code");
  if (!state || state.uid !== user.id || !code)
    return back(request, { error: "invalid_state" });

  try {
    const token = await exchangeCode(code);
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("integration_accounts")
      .select("id, refresh_token_enc")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle();

    // Google only returns a refresh token on first consent (we force prompt=consent, but be safe).
    const refreshEnc = token.refresh_token
      ? encryptSecret(token.refresh_token)
      : (existing?.refresh_token_enc ?? null);
    if (!refreshEnc) return back(request, { error: "no_refresh_token" });

    const accountEmail = await fetchUserEmail(token.access_token);
    const scopes = token.scope.split(" ").filter(Boolean);
    const row = {
      user_id: user.id,
      provider: "google" as const,
      account_email: accountEmail,
      scopes,
      refresh_token_enc: refreshEnc,
      access_token_enc: encryptSecret(token.access_token),
      access_token_expires_at: new Date(
        Date.now() + token.expires_in * 1000,
      ).toISOString(),
      status: "connected" as const,
      last_error: null,
    };

    const { error } = existing
      ? await supabase.from("integration_accounts").update(row).eq("id", existing.id)
      : await supabase.from("integration_accounts").insert(row);
    if (error) throw error;

    await logActivity(supabase, {
      userId: user.id,
      type: "integration_connected",
      title: `Connected Google account${accountEmail ? ` (${accountEmail})` : ""}`,
    });
    return back(request, { connected: "google" });
  } catch (e) {
    console.error("[google oauth] callback failed", e instanceof Error ? e.message : e);
    return back(request, {
      error: e instanceof GoogleAuthError ? e.code : "exchange_failed",
    });
  }
}
