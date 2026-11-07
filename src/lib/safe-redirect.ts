/**
 * Returns `next` only when it is a same-origin path, otherwise `fallback`.
 * Parsing with the URL API catches "//host" and the backslash variant, which
 * browsers also resolve to another origin (open-redirect protection).
 */
export function safeNextPath(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  try {
    const base = "http://same-origin.invalid";
    const url = new URL(next, base);
    if (url.origin === base) return url.pathname + url.search + url.hash;
  } catch {
    /* fall through */
  }
  return fallback;
}
