import "server-only";

import {
  bodyText,
  cleanSubject,
  cleanText,
  collectParts,
  extractLinks,
  parseFrom,
  type MessagePart,
} from "../email-content";
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
  // Your own replies in a recruiting thread are not new mail to review.
  "-from:me",
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
  /** Body text (the richer of the plain and HTML parts), truncated for the classifier. */
  text: string;
  /** Links found in the HTML part (used to find a job posting URL). */
  links: string[];
  /** True when the sender offers List-Unsubscribe (bulk/automated mail). */
  bulk: boolean;
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

interface GmailRaw {
  id: string;
  threadId: string;
  internalDate: string;
  snippet?: string;
  payload?: MessagePart;
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
  const { text, html } = collectParts(raw.payload);
  const body = (bodyText(text, html) || cleanText(raw.snippet ?? "")).slice(0, maxChars);
  const from = parseFrom(headers.from);
  const received = new Date(Number(raw.internalDate));
  return {
    id: raw.id,
    threadId: raw.threadId,
    internalDate: raw.internalDate,
    snippet: cleanText(raw.snippet ?? ""),
    headers,
    from,
    subject: cleanSubject(headers.subject),
    receivedAt: Number.isNaN(received.getTime())
      ? new Date().toISOString()
      : received.toISOString(),
    text: body,
    links: extractLinks(html),
    bulk: !!headers["list-unsubscribe"],
  };
}
