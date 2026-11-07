import "server-only";

import { headers } from "next/headers";

/**
 * The public origin of the current request (e.g. http://localhost:3000 locally,
 * https://your-app.vercel.app in production). Used to build links that must come
 * back to this same deployment: auth email links and the Google OAuth redirect.
 * Falls back to NEXT_PUBLIC_SITE_URL outside a request.
 *
 * Safe against Host spoofing because Supabase and Google only redirect to URLs
 * on their own allowlists.
 */
export async function getSiteUrl(): Promise<string> {
  const h = await headers().catch(() => null);
  const host = (h?.get("x-forwarded-host") ?? h?.get("host"))?.split(",")[0]?.trim();
  if (host) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
    const proto =
      h?.get("x-forwarded-proto")?.split(",")[0]?.trim() || (local ? "http" : "https");
    return `${proto}://${host}`;
  }
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}
