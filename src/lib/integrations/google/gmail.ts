import "server-only";

import { googleFetch } from "./client";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Gmail search restricted to likely recruiting mail. Everything is still
 * classified by the AI step; this query just keeps the volume (and quota)
 * small. Users can widen it later via a setting.
 */
export const RECRUITING_QUERY = [
  "-category:promotions",
  "-category:social",
  "(",
  'subject:(interview OR application OR applied OR recruiter OR position OR opportunity OR offer OR assessment OR "next steps" OR "job")',
  "OR from:(recruit OR talent OR careers OR hr OR hiring OR jobs OR noreply@linkedin.com OR onlinejobs.ph OR jobstreet OR indeed)",
  ")",
].join(" ");

export interface GmailMessageSummary {
  id: string;
  threadId: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string; // epoch ms as string
  snippet: string;
  headers: Record<string, string>;
  from: { name: string | null; email: string | null };
  subject: string;
  receivedAt: string; // ISO
  /** Plain-text body (decoded), truncated for the classifier. */
  text: string;
}

export async function listRecentMessages(
  accessToken: string,
  options: { newerThanDays?: number; maxResults?: number; query?: string } = {},
): Promise<GmailMessageSummary[]> {
  const q = `${options.query ?? RECRUITING_QUERY} newer_than:${options.newerThanDays ?? 14}d`;
  const params = new URLSearchParams({ q, maxResults: String(options.maxResults ?? 50) });
  const json = await googleFetch<{ messages?: GmailMessageSummary[] }>(
    accessToken,
    `${BASE}/messages?${params}`,
  );
  return json.messages ?? [];
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

interface GmailRaw {
  id: string;
  threadId: string;
  internalDate: string;
  snippet?: string;
  payload?: GmailPart;
}

function decodeBase64Url(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function extractText(part: GmailPart | undefined): { text: string; html: string } {
  if (!part) return { text: "", html: "" };
  let text = "";
  let html = "";
  const walk = (p: GmailPart) => {
    if (p.body?.data) {
      const decoded = decodeBase64Url(p.body.data);
      if (p.mimeType === "text/plain") text += decoded + "\n";
      else if (p.mimeType === "text/html") html += decoded;
    }
    p.parts?.forEach(walk);
  };
  walk(part);
  return { text: text.trim(), html };
}

function parseFrom(value: string | undefined): {
  name: string | null;
  email: string | null;
} {
  if (!value) return { name: null, email: null };
  const m = /^(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?$/.exec(value.trim());
  if (!m) return { name: value.trim() || null, email: null };
  return { name: m[1]?.trim() || null, email: m[2]?.toLowerCase() ?? null };
}

export async function getMessage(
  accessToken: string,
  id: string,
  maxChars = 6000,
): Promise<GmailMessage> {
  const raw = await googleFetch<GmailRaw>(
    accessToken,
    `${BASE}/messages/${id}?format=full`,
  );
  const headers: Record<string, string> = {};
  for (const h of raw.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
  const { text, html } = extractText(raw.payload);
  const body = (text || htmlToText(html) || raw.snippet || "").slice(0, maxChars);
  const from = parseFrom(headers.from);
  const received = new Date(Number(raw.internalDate));
  return {
    id: raw.id,
    threadId: raw.threadId,
    internalDate: raw.internalDate,
    snippet: raw.snippet ?? "",
    headers,
    from,
    subject: headers.subject ?? "(no subject)",
    receivedAt: Number.isNaN(received.getTime())
      ? new Date().toISOString()
      : received.toISOString(),
    text: body,
  };
}
