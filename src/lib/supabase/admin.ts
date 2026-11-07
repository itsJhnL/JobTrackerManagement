import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * Service-role client for server-side jobs that run without a user session
 * (the exchange-rate cron, integration sync). Bypasses RLS: only use it in
 * code paths that are not reachable with user input, and never in a request
 * that acts on behalf of a user without scoping every query by user_id.
 * Returns null when SUPABASE_SERVICE_ROLE_KEY is not configured.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type SupabaseAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
