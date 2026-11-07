import type { SupabaseServerClient } from "@/lib/supabase/server";
import type {
  CalendarEventRow,
  EmailMessageRow,
  IntegrationAccountRow,
} from "@/lib/supabase/database.types";
import type { ApplicationStatus, InterviewType } from "@/lib/constants";
import { detectInterview, guessCompany } from "@/lib/integrations/calendar-detect";
import { matchEmailToApplication } from "@/lib/integrations/matching";

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

export interface InterviewSuggestion {
  /** calendar_events.id */
  id: string;
  summary: string | null;
  starts_at: string;
  meeting_url: string | null;
  html_link: string | null;
  platform: string | null;
  interviewType: InterviewType;
  companyGuess: string | null;
  /** Closest application, when there is one (the user still confirms). */
  suggestedApplicationId: string | null;
}

/**
 * Calendar events that look like interviews but were not tracked automatically
 * because no application matched confidently. Upcoming and last 14 days only.
 */
export async function listInterviewSuggestions(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<InterviewSuggestion[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [eventsRes, appsRes] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id, summary, starts_at, ends_at, meeting_url, html_link, status")
      .eq("user_id", userId)
      .is("interview_id", null)
      .gte("starts_at", since)
      .order("starts_at", { ascending: true })
      .limit(200),
    supabase
      .from("applications")
      .select("id, company_name, job_title")
      .eq("user_id", userId)
      .is("archived_at", null),
  ]);
  if (eventsRes.error) throw eventsRes.error;
  if (appsRes.error) throw appsRes.error;
  const candidates = appsRes.data ?? [];

  const out: InterviewSuggestion[] = [];
  for (const e of eventsRes.data ?? []) {
    if (!e.starts_at || e.status === "cancelled") continue;
    // All-day events are stored at midnight UTC with a whole-day length.
    const allDay =
      /T00:00:00(\.000)?(Z|\+00:00)$/.test(e.starts_at) &&
      !!e.ends_at &&
      (Date.parse(e.ends_at) - Date.parse(e.starts_at)) % 86_400_000 === 0;
    const d = detectInterview(
      { summary: e.summary, meetingUrl: e.meeting_url, allDay },
      candidates,
    );
    if (!d.isInterview) continue;
    const alternative = matchEmailToApplication(
      { from_email: null, subject: e.summary ?? "", text: "" },
      candidates,
    );
    out.push({
      id: e.id,
      summary: e.summary,
      starts_at: e.starts_at,
      meeting_url: e.meeting_url,
      html_link: e.html_link,
      platform: d.platform,
      interviewType: d.interviewType,
      companyGuess:
        d.companyGuess ?? guessCompany({ summary: e.summary, meetingUrl: null, allDay }),
      suggestedApplicationId:
        d.applicationId ??
        alternative.applicationId ??
        alternative.alternatives[0]?.id ??
        null,
    });
  }
  return out.slice(0, 20);
}
