import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/** Browser-side Supabase client. Only used in client components for auth flows. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
