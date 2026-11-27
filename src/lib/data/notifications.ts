import type { ActivityType, ApplicationStatus } from "@/lib/constants";
import {
  NOTIFICATION_ACTIVITY_TYPES,
  NOTIFICATION_DISMISSED_KEY,
  NOTIFICATION_READ_KEY,
  NOTIFY_KEY,
  categoryForActivity,
  isNotificationUnread,
  notificationDescription,
  notificationHref,
  type InboxCategory,
} from "@/lib/notifications";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/** How far back the Inbox shows notifications. */
const NOTIFICATION_WINDOW_DAYS = 90;

export interface InboxNotification {
  id: string;
  type: ActivityType;
  category: InboxCategory;
  title: string;
  description: string;
  /** Company and role the notification is about, when it has an application. */
  application: {
    id: string;
    company_name: string;
    job_title: string;
    status: ApplicationStatus;
  } | null;
  at: string;
  unread: boolean;
  /** "you" or "sync"; null for history from before notifications existed. */
  actor: string | null;
  href: string;
}

type Row = {
  id: string;
  application_id: string | null;
  activity_type: ActivityType;
  title: string;
  metadata: unknown;
  created_at: string;
  application: InboxNotification["application"];
};

function toNotification(r: Row): InboxNotification {
  const metadata = (r.metadata ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    type: r.activity_type,
    category: categoryForActivity(r.activity_type, metadata),
    title: r.title,
    description: notificationDescription(r.activity_type, metadata),
    application: r.application,
    at: r.created_at,
    unread: isNotificationUnread(metadata),
    actor: typeof metadata.actor === "string" ? metadata.actor : null,
    href: notificationHref(r.activity_type, r.application_id),
  };
}

/**
 * Notifications for the Inbox, newest first: status changes, offers, hires,
 * interviews and saved applications from the last 90 days that the user has
 * not removed. One indexed query (user_id, created_at desc).
 */
export async function listInboxNotifications(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 100,
): Promise<InboxNotification[]> {
  const since = new Date(
    Date.now() - NOTIFICATION_WINDOW_DAYS * 86_400_000,
  ).toISOString();
  const { data, error } = await supabase
    .from("activities")
    .select(
      "id, application_id, activity_type, title, metadata, created_at, application:applications(id, company_name, job_title, status)",
    )
    .eq("user_id", userId)
    .in("activity_type", [...NOTIFICATION_ACTIVITY_TYPES])
    .is(`metadata->>${NOTIFICATION_DISMISSED_KEY}`, null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toNotification);
}

/** Unread notification count and the newest few, for the badge and the bell. */
export async function getUnreadNotifications(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 5,
): Promise<{ count: number; latest: InboxNotification[] }> {
  const { data, count, error } = await supabase
    .from("activities")
    .select(
      "id, application_id, activity_type, title, metadata, created_at, application:applications(id, company_name, job_title, status)",
      { count: "exact" },
    )
    .eq("user_id", userId)
    .in("activity_type", [...NOTIFICATION_ACTIVITY_TYPES])
    .eq(`metadata->>${NOTIFY_KEY}`, "true")
    .is(`metadata->>${NOTIFICATION_READ_KEY}`, null)
    .is(`metadata->>${NOTIFICATION_DISMISSED_KEY}`, null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return {
    count: count ?? 0,
    latest: ((data ?? []) as unknown as Row[]).map(toNotification),
  };
}
