import "server-only";

import { getSiteUrl } from "@/lib/site-url";

/**
 * Google OAuth 2.0 (authorization code + refresh token). No SDK: three HTTPS
 * calls. Credentials come from GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and
 * are never sent to the browser.
 *
 * Scopes are the minimum for the feature set:
 *  - gmail.readonly  : read messages to detect recruiting emails (no send, no modify)
 *  - calendar.events : read/create interview events on the user's calendar
 *  - userinfo.email  : show which Google account is connected
 */
export const GOOGLE_SCOPES = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  calendar: "https://www.googleapis.com/auth/calendar.events",
  email: "https://www.googleapis.com/auth/userinfo.email",
} as const;

export type GoogleFeature = "gmail" | "calendar";

/** The callback URL for this deployment. It must be listed in Google Cloud. */
export async function googleRedirectUri() {
  return `${await getSiteUrl()}/api/integrations/google/callback`;
}

export async function googleOAuthStatus() {
  return {
    configured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: await googleRedirectUri(),
  };
}

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error(
      "Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
    );
  return { clientId, clientSecret };
}

export async function buildAuthUrl(
  state: string,
  features: GoogleFeature[],
  loginHint?: string | null,
) {
  const { clientId } = credentials();
  const redirectUri = await googleRedirectUri();
  const scopes = [GOOGLE_SCOPES.email, ...features.map((f) => GOOGLE_SCOPES[f])];
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline", // refresh token
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    scope: scopes.join(" "),
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok)
    throw new GoogleAuthError(
      json.error ?? "token_error",
      json.error_description ?? `Google token endpoint returned ${res.status}`,
    );
  return json;
}

export class GoogleAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
  /** True when the user must reconnect (refresh token revoked or expired). */
  get needsReconnect() {
    return this.code === "invalid_grant";
  }
}

export async function exchangeCode(code: string) {
  const { clientId, clientSecret } = credentials();
  const redirectUri = await googleRedirectUri();
  return tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = credentials();
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
}

export async function revokeToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined); // best effort; the row is deleted regardless
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}
