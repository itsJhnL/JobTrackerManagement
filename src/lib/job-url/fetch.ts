import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Downloads a job posting page on the server, on behalf of a signed-in user.
 *
 * Because the URL comes from the user, this guards against server-side request
 * forgery: only http(s) on standard ports, no private or internal addresses
 * (checked again after every redirect), a hard timeout and a size cap.
 */

export class JobPageError extends Error {
  constructor(
    public code: "invalid_url" | "blocked" | "unreachable" | "not_html" | "too_large",
    message: string,
  ) {
    super(message);
    this.name = "JobPageError";
  }
}

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

/** True for loopback, private, link-local, CGNAT, multicast and reserved ranges. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      v === "::" ||
      v === "::1" ||
      v.startsWith("fc") ||
      v.startsWith("fd") ||
      v.startsWith("fe8") ||
      v.startsWith("fe9") ||
      v.startsWith("fea") ||
      v.startsWith("feb") ||
      v.startsWith("ff")
    );
  }
  return true;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new JobPageError("invalid_url", "That doesn't look like a valid link.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new JobPageError("invalid_url", "Only http and https links can be read.");
  if (url.username || url.password)
    throw new JobPageError(
      "invalid_url",
      "Links with a username or password are not supported.",
    );
  if (url.port && url.port !== "80" && url.port !== "443")
    throw new JobPageError("blocked", "That link uses a port that can't be read.");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.local$|\.internal$/i.test(host))
    throw new JobPageError("blocked", "That address can't be read.");
  const addresses = isIP(host)
    ? [host]
    : await lookup(host, { all: true })
        .then((r) => r.map((a) => a.address))
        .catch(() => {
          throw new JobPageError("unreachable", `Couldn't find the site ${host}.`);
        });
  if (addresses.length === 0 || addresses.some(isPrivateAddress))
    throw new JobPageError("blocked", "That address can't be read.");
  return url;
}

export interface FetchedPage {
  /** Final URL after redirects. */
  url: string;
  html: string;
}

export async function fetchJobPage(rawUrl: string): Promise<FetchedPage> {
  let url = await assertPublicUrl(rawUrl);
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        cache: "no-store",
        headers: {
          // A regular browser profile; many job boards refuse unknown clients.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch (e) {
      const timedOut = e instanceof Error && /timeout|abort/i.test(e.name);
      throw new JobPageError(
        "unreachable",
        timedOut
          ? "The job site took too long to respond."
          : "Couldn't reach the job site.",
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hop >= MAX_REDIRECTS)
        throw new JobPageError("unreachable", "The job site redirected too many times.");
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }

    if (
      res.status === 401 ||
      res.status === 403 ||
      res.status === 429 ||
      res.status === 999
    )
      throw new JobPageError(
        "blocked",
        "This job site blocks automatic reading (it may need you to sign in).",
      );
    if (res.status === 404 || res.status === 410)
      throw new JobPageError(
        "unreachable",
        "That job posting was not found. It may have closed.",
      );
    if (!res.ok)
      throw new JobPageError(
        "unreachable",
        `The job site answered with an error (${res.status}).`,
      );

    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type))
      throw new JobPageError(
        "not_html",
        "That link isn't a web page (for example, it's a PDF).",
      );

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES)
      throw new JobPageError("too_large", "That page is too large to read.");

    // Read with a running size cap, since content-length can be missing or wrong.
    const reader = res.body?.getReader();
    if (!reader) return { url: url.toString(), html: "" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new JobPageError("too_large", "That page is too large to read.");
      }
      chunks.push(value);
    }
    const html = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
    return { url: url.toString(), html };
  }
}
