import type { SupabaseServerClient } from "@/lib/supabase/server";
import type {
  CalendarEventRow,
  EmailMessageRow,
  IntegrationAccountRow,
} from "@/lib/supabase/database.types";
import type { ApplicationStatus } from "@/lib/constants";

/** Account status without any token material (safe to send to the client). */
export interface IntegrationSummary {
  connected: boolean;
  accountEmail: string | null;
  status: IntegrationAccountRow["status"] | null;
  scopes: string[];
  gmail: boolean;
  calendar: boolean;
  lastGmailSyncAt: string | null;
  lastCalendarSyncAt: string | null;
  lastError: string | null;
  pendingEmails: number;
}

export async function getIntegrationSummary(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<IntegrationSummary> {
  const [{ data: account, error }, { count }] = await Promise.all([
    supabase
      .from("integration_accounts")
      .select(
        "account_email, status, scopes, last_gmail_sync_at, last_calendar_sync_at, last_error",
      )
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle(),
    supabase
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("review_status", "pending")
      .neq("classification", "not_recruiting"),
  ]);
  if (error) throw error;
  if (!account) {
    return {
      connected: false,
      accountEmail: null,
      status: null,
      scopes: [],
      gmail: false,
      calendar: false,
      lastGmailSyncAt: null,
      lastCalendarSyncAt: null,
      lastError: null,
      pendingEmails: 0,
    };
  }
  return {
    connected: account.status !== "revoked",
    accountEmail: account.account_email,
    status: account.status,
    scopes: account.scopes,
    gmail: account.scopes.some((s) => s.includes("gmail")),
    calendar: account.scopes.some((s) => s.includes("calendar")),
    lastGmailSyncAt: account.last_gmail_sync_at,
    lastCalendarSyncAt: account.last_calendar_sync_at,
    lastError: account.last_error,
    pendingEmails: count ?? 0,
  };
}

export interface EmailMessageWithApplication extends EmailMessageRow {
  application: {
    id: string;
    company_name: string;
    job_title: string;
    status: ApplicationStatus;
  } | null;
}

export async function listEmailMessages(
  supabase: SupabaseServerClient,
  userId: string,
  options: { review?: EmailMessageRow["review_status"]; limit?: number } = {},
): Promise<EmailMessageWithApplication[]> {
  let q = supabase
    .from("email_messages")
    .select("*, application:applications(id, company_name, job_title, status)")
    .eq("user_id", userId)
    .neq("classification", "not_recruiting")
    .order("received_at", { ascending: false })
    .limit(options.limit ?? 100);
  if (options.review) q = q.eq("review_status", options.review);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EmailMessageWithApplication[];
}

export interface CalendarEventWithInterview extends CalendarEventRow {
  interview: { id: string; application_id: string; title: string | null } | null;
}

export async function listUpcomingCalendarEvents(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 20,
): Promise<CalendarEventWithInterview[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*, interview:interviews(id, application_id, title)")
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CalendarEventWithInterview[];
}
