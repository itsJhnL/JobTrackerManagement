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
