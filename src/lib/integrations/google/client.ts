import "server-only";

import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { IntegrationAccountRow } from "@/lib/supabase/database.types";

import { decryptSecret, encryptSecret } from "./crypto";
import { GoogleAuthError, refreshAccessToken } from "./oauth";

/** Minimal client that any Supabase client (user or admin) satisfies. */
export type DbClient = Pick<SupabaseServerClient, "from">;

export async function getGoogleAccount(
  db: DbClient,
  userId: string,
): Promise<IntegrationAccountRow | null> {
  const { data, error } = await db
    .from("integration_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Returns a valid access token for the account, refreshing (and persisting
 * the refreshed, encrypted token) when it is missing or about to expire.
 */
export async function getAccessToken(
  db: DbClient,
  account: IntegrationAccountRow,
): Promise<string> {
  const expiresAt = account.access_token_expires_at
    ? new Date(account.access_token_expires_at).getTime()
    : 0;
  if (account.access_token_enc && expiresAt - Date.now() > 60_000) {
    return decryptSecret(account.access_token_enc);
  }
  if (!account.refresh_token_enc)
    throw new GoogleAuthError(
      "invalid_grant",
      "No refresh token stored; reconnect Google.",
    );

  try {
    const token = await refreshAccessToken(decryptSecret(account.refresh_token_enc));
    const patch = {
      access_token_enc: encryptSecret(token.access_token),
      access_token_expires_at: new Date(
        Date.now() + token.expires_in * 1000,
      ).toISOString(),
      status: "connected" as const,
      last_error: null,
      ...(token.refresh_token
        ? { refresh_token_enc: encryptSecret(token.refresh_token) }
        : {}),
    };
    await db.from("integration_accounts").update(patch).eq("id", account.id);
    account.access_token_enc = patch.access_token_enc;
    account.access_token_expires_at = patch.access_token_expires_at;
    return token.access_token;
  } catch (e) {
    if (e instanceof GoogleAuthError && e.needsReconnect) {
      await db
        .from("integration_accounts")
        .update({
          status: "revoked",
          last_error: "Google access was revoked or expired. Reconnect your account.",
        })
        .eq("id", account.id);
    }
    throw e;
  }
}

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

/** Authenticated JSON call against a Google API; throws GoogleApiError on non-2xx. */
export async function googleFetch<T>(
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok)
    throw new GoogleApiError(
      res.status,
      json.error?.message ?? `Google API returned ${res.status}`,
    );
  return json;
}
