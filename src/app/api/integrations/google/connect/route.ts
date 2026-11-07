import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isEncryptionConfigured, signState } from "@/lib/integrations/google/crypto";
import {
  buildAuthUrl,
  googleOAuthStatus,
  type GoogleFeature,
} from "@/lib/integrations/google/oauth";

/**
 * GET /api/integrations/google/connect?features=gmail,calendar
 * Starts the Google OAuth flow for the signed-in user. The state is signed
 * and bound to the user id so the callback cannot be replayed for another account.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.redirect(
      new URL("/login?next=/settings?tab=integrations", request.url),
    );

  const { configured } = await googleOAuthStatus();
  if (!configured || !isEncryptionConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=not_configured", request.url),
    );
  }

  const requested = (request.nextUrl.searchParams.get("features") ?? "gmail,calendar")
    .split(",")
    .map((f) => f.trim())
    .filter((f): f is GoogleFeature => f === "gmail" || f === "calendar");
  const features: GoogleFeature[] = requested.length ? requested : ["gmail", "calendar"];

  const state = signState({
    uid: user.id,
    features: features.join(","),
    nonce: crypto.randomUUID(),
  });
  return NextResponse.redirect(await buildAuthUrl(state, features, user.email));
}
