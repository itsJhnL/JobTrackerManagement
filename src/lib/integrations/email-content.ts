/**
 * Pure helpers that turn a Gmail message payload into clean text.
 *
 * Many senders put the useful part only in the HTML version. Indeed's
 * application confirmation, for example, has a text/plain part that says
 * "Your application has been submitted" with no job or company; the company
 * name appears only in the HTML. So the body used for classification is the
 * richer of the two, not simply the plain-text part.
 */

import { decodeEntities, htmlToText } from "@/lib/job-url/extract";

export interface MessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: MessagePart[];
  headers?: { name: string; value: string }[];
}

/** Zero-width and invisible characters that email templates pad preheaders with. */
const INVISIBLE = /[­͏​-‏⁠﻿]/g;

export function decodeBase64Url(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

export function collectParts(part: MessagePart | undefined): {
  text: string;
  html: string;
} {
  let text = "";
  let html = "";
  const walk = (p: MessagePart) => {
    if (p.body?.data) {
      const decoded = decodeBase64Url(p.body.data);
      if (p.mimeType === "text/plain") text += decoded + "\n";
      else if (p.mimeType === "text/html") html += decoded;
    }
    p.parts?.forEach(walk);
  };
  if (part) walk(part);
  return { text: text.trim(), html };
}

/** Tidies text: decodes entities, drops invisible padding, collapses blank runs. */
export function cleanText(s: string) {
  return decodeEntities(s)
    .replace(INVISIBLE, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Subjects sometimes arrive with HTML entities ("Bluedog &ndash; QA Engineer"). */
export function cleanSubject(subject: string | null | undefined) {
  return cleanText(subject ?? "").replace(/\s+/g, " ") || "(no subject)";
}

/** Meeting and scheduling links worth keeping when the HTML version is used. */
const MEETING_LINK =
  /\b(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|calendly\.com|webex\.com|whereby\.com|skype\.com)\//i;

/**
 * The body to classify: whichever of the plain and HTML versions says more.
 * Rendered HTML loses link targets, so meeting links from it are appended.
 */
export function bodyText(plain: string, html: string) {
  const fromPlain = cleanText(plain);
  const fromHtml = html ? cleanText(htmlToText(html)) : "";
  if (fromHtml.length <= fromPlain.length) return fromPlain;
  const meetings = extractLinks(html).filter((l) => MEETING_LINK.test(l));
  return meetings.length ? `${fromHtml}\n\nLinks:\n${meetings.join("\n")}` : fromHtml;
}

/** Absolute http(s) links in the HTML, decoded, in order, without duplicates. */
export function extractLinks(html: string, max = 60) {
  const out: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = decodeEntities(m[1]).trim();
    if (/^https?:\/\//i.test(href) && !out.includes(href)) out.push(href);
    if (out.length >= max) break;
  }
  return out;
}

export function parseFrom(value: string | undefined): {
  name: string | null;
  email: string | null;
} {
  if (!value) return { name: null, email: null };
  const m = /^(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?$/.exec(value.trim());
  if (!m) return { name: value.trim() || null, email: null };
  return { name: m[1]?.trim() || null, email: m[2]?.toLowerCase() ?? null };
}
