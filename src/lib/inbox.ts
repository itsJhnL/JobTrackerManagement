import { decodeEntities } from "@/lib/job-url/extract";
import type { EmailMessageRow } from "@/lib/supabase/database.types";

/**
 * "Read" state for detected emails. There is no column for it, so the time an
 * email was first opened is kept in `extracted.read_at` (no migration needed).
 * Unread = awaiting review and never opened.
 */
export const EMAIL_READ_KEY = "read_at";

export function isEmailUnread(e: Pick<EmailMessageRow, "review_status" | "extracted">) {
  const x = e.extracted as Record<string, unknown> | null;
  return e.review_status === "pending" && !x?.[EMAIL_READ_KEY];
}

export type InboxGroup = "review" | "handled" | "saved" | "filtered";

/**
 * Which Inbox tab an email belongs to:
 *  - review   → awaiting the user (the real Inbox);
 *  - handled  → confirmed by the user;
 *  - saved    → an application confirmation filed to Applications automatically;
 *  - filtered → job alerts, promotions, own mail, or dismissed by the user.
 */
export function inboxGroup(
  e: Pick<EmailMessageRow, "review_status" | "extracted">,
): InboxGroup {
  if (e.review_status === "pending") return "review";
  if (e.review_status === "dismissed") return "filtered";
  const x = e.extracted as Record<string, unknown> | null;
  return x?.destination === "applications" ? "saved" : "handled";
}

/** Subjects stored before entity decoding was added may contain "&ndash;". */
export function displaySubject(subject: string | null | undefined) {
  return decodeEntities(subject ?? "").trim() || "(no subject)";
}
