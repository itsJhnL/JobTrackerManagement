import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";

/**
 * Server-side Supabase client bound to the request cookies.
 * Use in Server Components, Server Actions and Route Handlers.
 *
 * Memoised per request with React.cache so the layout, the page and every
 * data helper in one render share a single client (and so data-layer
 * functions wrapped in React.cache get cache hits on the same arguments).
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: cookies cannot be written there.
            // The proxy refreshes sessions, so this is safe to ignore.
          }
        },
      },
    },
  );
});

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
