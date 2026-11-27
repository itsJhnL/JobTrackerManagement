"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  fail,
  fromUnknownError,
  fromZodError,
  ok,
  type ActionResult,
} from "@/lib/action-result";
import { requireUserForAction } from "@/lib/auth";
import { EMAIL_READ_KEY } from "@/lib/inbox";
import {
  NOTIFICATION_ACTIVITY_TYPES,
  NOTIFICATION_DISMISSED_KEY,
  NOTIFICATION_READ_KEY,
  NOTIFY_KEY,
} from "@/lib/notifications";
import type { Json } from "@/lib/supabase/database.types";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validations/common";

type JsonObject = Record<string, Json | undefined>;

const setReadSchema = z.object({
  /** email_messages ids */
  emails: z.array(uuid).max(500).default([]),
  /** activities ids */
  notifications: z.array(uuid).max(500).default([]),
  read: z.boolean(),
});

/** Read state lives in a jsonb column on both tables: merge, never replace. */
function withRead(current: Json | null, key: string, read: boolean, at: string) {
  const next: JsonObject = { ...((current as JsonObject | null) ?? {}) };
  if (read) next[key] = at;
  else delete next[key];
  return next as Json;
}

async function setEmailsRead(
  supabase: SupabaseServerClient,
  userId: string,
  read: boolean,
  ids: string[] | null,
) {
  let q = supabase
    .from("email_messages")
    .select("id, extracted")
    .eq("user_id", userId)
    .eq("review_status", "pending");
  if (ids) q = q.in("id", ids);
  else q = q.is(`extracted->>${EMAIL_READ_KEY}`, null);
  const { data, error } = await q.limit(500);
  if (error) throw error;
  const at = new Date().toISOString();
  const results = await Promise.all(
    (data ?? []).map((e) =>
      supabase
        .from("email_messages")
        .update({ extracted: withRead(e.extracted, EMAIL_READ_KEY, read, at) })
        .eq("id", e.id)
        .eq("user_id", userId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
  return data?.length ?? 0;
}

async function setNotificationsRead(
  supabase: SupabaseServerClient,
  userId: string,
  read: boolean,
  ids: string[] | null,
) {
  let q = supabase
    .from("activities")
    .select("id, metadata")
    .eq("user_id", userId)
    .in("activity_type", [...NOTIFICATION_ACTIVITY_TYPES]);
  if (ids) q = q.in("id", ids);
  else
    q = q
      .eq(`metadata->>${NOTIFY_KEY}`, "true")
      .is(`metadata->>${NOTIFICATION_READ_KEY}`, null);
  const { data, error } = await q.limit(500);
  if (error) throw error;
  const at = new Date().toISOString();
  const results = await Promise.all(
    (data ?? []).map((n) => {
      const metadata = withRead(
        n.metadata,
        NOTIFICATION_READ_KEY,
        read,
        at,
      ) as JsonObject;
      // Marking older history unread makes it a live notification.
      if (!read) metadata[NOTIFY_KEY] = true;
      return supabase
        .from("activities")
        .update({ metadata: metadata as Json })
        .eq("id", n.id)
        .eq("user_id", userId);
    }),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
  return data?.length ?? 0;
}

/** Marks specific Inbox items read or unread. */
export async function setInboxRead(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = setReadSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const { emails, notifications, read } = parsed.data;
  try {
    const { user, supabase } = await requireUserForAction();
    const [a, b] = await Promise.all([
      emails.length ? setEmailsRead(supabase, user.id, read, emails) : 0,
      notifications.length
        ? setNotificationsRead(supabase, user.id, read, notifications)
        : 0,
    ]);
    revalidatePath("/", "layout");
    return ok({ count: a + b });
  } catch (e) {
    return fromUnknownError(e);
  }
}

/** Marks every unread email and notification in the Inbox as read. */
export async function markAllInboxRead(): Promise<ActionResult<{ count: number }>> {
  try {
    const { user, supabase } = await requireUserForAction();
    const [a, b] = await Promise.all([
      setEmailsRead(supabase, user.id, true, null),
      setNotificationsRead(supabase, user.id, true, null),
    ]);
    revalidatePath("/", "layout");
    return ok({ count: a + b });
  } catch (e) {
    return fromUnknownError(e);
  }
}

/**
 * Removes a notification from the Inbox. The activity itself stays in the
 * application's history; only its Inbox entry is hidden.
 */
export async function dismissNotification(input: unknown): Promise<ActionResult> {
  const parsed = uuid.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data: row, error } = await supabase
      .from("activities")
      .select("id, metadata")
      .eq("id", parsed.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!row) return fail("Notification not found.");
    const { error: upErr } = await supabase
      .from("activities")
      .update({
        metadata: {
          ...((row.metadata as JsonObject | null) ?? {}),
          [NOTIFICATION_DISMISSED_KEY]: new Date().toISOString(),
        } as Json,
      })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (upErr) return fail(upErr.message);
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fromUnknownError(e);
  }
}
