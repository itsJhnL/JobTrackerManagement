import "server-only";

import { AiError, type AiProvider } from "@/lib/ai/types";
import { logActivity } from "@/lib/data/activities";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type {
  IntegrationAccountRow,
  InterviewRow,
  Json,
} from "@/lib/supabase/database.types";

import {
  eventMeetingUrl,
  insertEvent,
  listUpcomingEvents,
  updateEvent,
  APP_EVENT_KEY,
} from "./calendar";
import { getAccessToken } from "./client";
import { getMessage, listRecentMessages } from "./gmail";
import { AUTO_LINK_CONFIDENCE, matchEmailToApplication } from "../matching";

export interface GmailSyncResult {
  scanned: number;
  /** New messages found this run (not yet stored). */
  fresh: number;
  stored: number;
  recruiting: number;
  skippedExisting: number;
  /** New messages left for the next run because the time budget ran out. */
  remaining: number;
  /**
   * Set when the AI provider was overloaded or rate limited. The run stops early;
   * unprocessed emails are not stored, so the next sync picks them up.
   */
  aiUnavailable: string | null;
  errors: string[];
}

/** Messages classified at once. Keeps Gemini under typical per-minute limits. */
const GMAIL_CONCURRENCY = 4;

/**
 * Pulls recent recruiting-looking messages, classifies new ones with the AI
 * provider, matches them to applications and stores them for review.
 * Idempotent: (user_id, gmail_message_id) is unique, so re-runs skip stored mail.
 */
export async function syncGmail(
  supabase: SupabaseServerClient,
  userId: string,
  account: IntegrationAccountRow,
  ai: AiProvider,
  userTimezone: string,
  options: {
    newerThanDays?: number;
    maxMessages?: number;
    /** Stop starting new messages after this many ms; the rest are reported as `remaining`. */
    budgetMs?: number;
  } = {},
): Promise<GmailSyncResult> {
  const deadline = Date.now() + (options.budgetMs ?? Number.POSITIVE_INFINITY);
  const result: GmailSyncResult = {
    scanned: 0,
    fresh: 0,
    stored: 0,
    recruiting: 0,
    skippedExisting: 0,
    remaining: 0,
    aiUnavailable: null,
    errors: [],
  };
  const token = await getAccessToken(supabase, account);

  const summaries = await listRecentMessages(token, {
    newerThanDays: options.newerThanDays ?? 14,
    maxResults: options.maxMessages ?? 40,
  });
  result.scanned = summaries.length;
  if (summaries.length === 0) {
    await touch(supabase, account.id, {
      last_gmail_sync_at: new Date().toISOString(),
      last_error: null,
    });
    return result;
  }

  const { data: existing } = await supabase
    .from("email_messages")
    .select("gmail_message_id")
    .eq("user_id", userId)
    .in(
      "gmail_message_id",
      summaries.map((m) => m.id),
    );
  const known = new Set((existing ?? []).map((e) => e.gmail_message_id));
  const fresh = summaries.filter((m) => !known.has(m.id));
  result.skippedExisting = summaries.length - fresh.length;
  result.fresh = fresh.length;

  const { data: apps } = await supabase
    .from("applications")
    .select("id, company_name, job_title, job_url, contacts(email)")
    .eq("user_id", userId)
    .is("archived_at", null);
  const candidates = (apps ?? []).map((a) => ({
    id: a.id,
    company_name: a.company_name,
    job_title: a.job_title,
    contact_emails: ((a.contacts as { email: string | null }[] | null) ?? [])
      .map((c) => c.email)
      .filter((e): e is string => !!e),
    domains: domainFromUrl(a.job_url),
  }));

  const processOne = async (summary: (typeof fresh)[number]) => {
    try {
      const msg = await getMessage(token, summary.id);
      const analysis = await ai.classifyEmail({
        from_name: msg.from.name,
        from_email: msg.from.email,
        subject: msg.subject,
        received_at: msg.receivedAt,
        text: msg.text,
        candidates: candidates.map(({ id, company_name, job_title }) => ({
          id,
          company_name,
          job_title,
        })),
        user_timezone: userTimezone,
      });

      // Deterministic match first; the model's pick is only used when it agrees or nothing else matched.
      const det = matchEmailToApplication(
        {
          from_email: msg.from.email,
          subject: msg.subject,
          text: msg.text,
          extracted: { company: analysis.company, job_title: analysis.job_title },
        },
        candidates,
      );
      const validModelPick =
        analysis.matched_application_id &&
        candidates.some((c) => c.id === analysis.matched_application_id)
          ? analysis.matched_application_id
          : null;
      let applicationId: string | null = det.applicationId;
      let matchConfidence = det.confidence;
      if (
        !applicationId &&
        validModelPick &&
        analysis.match_confidence >= AUTO_LINK_CONFIDENCE &&
        det.alternatives.length <= 1
      ) {
        applicationId = validModelPick;
        matchConfidence = analysis.match_confidence;
      }

      const isRecruiting = analysis.kind !== "not_recruiting";
      const { error } = await supabase.from("email_messages").insert({
        user_id: userId,
        account_id: account.id,
        gmail_message_id: msg.id,
        gmail_thread_id: msg.threadId,
        from_name: msg.from.name,
        from_email: msg.from.email,
        subject: msg.subject,
        snippet: msg.snippet.slice(0, 500),
        received_at: msg.receivedAt,
        classification: analysis.kind,
        confidence: analysis.confidence,
        extracted: {
          ...analysis,
          match_reason: det.reason,
          alternatives: det.alternatives,
        } as unknown as Json,
        application_id: applicationId,
        match_confidence: matchConfidence,
        review_status: isRecruiting ? "pending" : "dismissed",
        processed_at: new Date().toISOString(),
      });
      if (error) throw error;
      result.stored += 1;
      if (isRecruiting) {
        result.recruiting += 1;
        await logActivity(supabase, {
          userId,
          applicationId,
          type: "email_detected",
          title: `${labelFor(analysis.kind)} detected: ${msg.subject}`.slice(0, 200),
          metadata: { gmail_message_id: msg.id },
        });
      }
    } catch (e) {
      if (e instanceof AiError && e.retryable) {
        // Busy or rate limited after retries: stop starting new emails instead of
        // hammering the provider. This email stays unstored and is retried next sync.
        result.aiUnavailable ??= e.message;
        return;
      }
      result.errors.push(`${summary.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Small worker pool: each email needs a Gmail fetch and an AI call, so running
  // them one by one made a full sync take minutes.
  let next = 0;
  const worker = async () => {
    while (next < fresh.length && Date.now() < deadline && !result.aiUnavailable) {
      await processOne(fresh[next++]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(GMAIL_CONCURRENCY, fresh.length) }, worker),
  );
  result.remaining = fresh.length - next;

  await touch(supabase, account.id, {
    last_gmail_sync_at: new Date().toISOString(),
    last_error: result.aiUnavailable
      ? `The AI was busy, so ${fresh.length - result.stored} new email(s) were not checked yet. Sync again in a few minutes.`
      : result.errors.length
        ? `${result.errors.length} email(s) could not be processed: ${result.errors[0].replace(/^[^:]+: /, "")}`
        : null,
    status: "connected",
  });
  return result;
}

function labelFor(kind: string) {
  return kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function domainFromUrl(url: string | null) {
  if (!url) return [];
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return [host];
  } catch {
    return [];
  }
}

async function touch(
  supabase: SupabaseServerClient,
  accountId: string,
  patch: Partial<IntegrationAccountRow>,
) {
  await supabase.from("integration_accounts").update(patch).eq("id", accountId);
}

export interface CalendarSyncResult {
  fetched: number;
  upserted: number;
  cancelled: number;
}

/**
 * Mirrors upcoming Google Calendar events into calendar_events and links the
 * ones we created to their interview (via the private extended property).
 * Idempotent on (user_id, calendar_id, google_event_id).
 */
export async function syncCalendar(
  supabase: SupabaseServerClient,
  userId: string,
  account: IntegrationAccountRow,
): Promise<CalendarSyncResult> {
  const token = await getAccessToken(supabase, account);
  const events = await listUpcomingEvents(token, { days: 90 });
  let cancelled = 0;

  const rows = events
    .filter((e) => e.id)
    .map((e) => {
      if (e.status === "cancelled") cancelled += 1;
      return {
        user_id: userId,
        account_id: account.id,
        interview_id: e.extendedProperties?.private?.[APP_EVENT_KEY] ?? null,
        google_event_id: e.id,
        google_calendar_id: "primary",
        summary: e.summary ?? null,
        starts_at:
          e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00Z` : null),
        ends_at: e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00Z` : null),
        timezone: e.start?.timeZone ?? null,
        meeting_url: eventMeetingUrl(e),
        html_link: e.htmlLink ?? null,
        status: e.status ?? null,
        etag: e.etag ?? null,
        synced_at: new Date().toISOString(),
      };
    });

  if (rows.length) {
    const { error } = await supabase
      .from("calendar_events")
      .upsert(rows, { onConflict: "user_id,google_calendar_id,google_event_id" });
    if (error) throw error;
  }

  // Reflect rescheduling/cancellation on linked interviews.
  await Promise.all(
    rows.map(async (r) => {
      if (!r.interview_id) return;
      if (r.status === "cancelled") {
        await supabase
          .from("interviews")
          .update({ outcome: "cancelled" })
          .eq("id", r.interview_id)
          .eq("user_id", userId)
          .eq("outcome", "pending");
      } else if (r.starts_at) {
        await supabase
          .from("interviews")
          .update({ scheduled_at: r.starts_at, meeting_url: r.meeting_url ?? undefined })
          .eq("id", r.interview_id)
          .eq("user_id", userId)
          .neq("scheduled_at", r.starts_at);
      }
    }),
  );

  await touch(supabase, account.id, {
    last_calendar_sync_at: new Date().toISOString(),
    status: "connected",
    last_error: null,
  });
  await logActivity(supabase, {
    userId,
    type: "calendar_synced",
    title: `Calendar synced: ${rows.length} upcoming event${rows.length === 1 ? "" : "s"}`,
  });
  return { fetched: events.length, upserted: rows.length, cancelled };
}

/** Creates (or updates) the Google Calendar event for an interview and records the link. */
export async function pushInterviewToCalendar(
  supabase: SupabaseServerClient,
  userId: string,
  account: IntegrationAccountRow,
  interview: InterviewRow,
  app: { company_name: string; job_title: string },
) {
  const token = await getAccessToken(supabase, account);
  const start = new Date(interview.scheduled_at);
  const end = new Date(start.getTime() + (interview.duration_minutes ?? 60) * 60_000);
  const input = {
    summary: `Interview: ${app.company_name} · ${interview.title ?? app.job_title}`,
    description: [
      interview.interviewer ? `With ${interview.interviewer}` : null,
      interview.platform ? `Platform: ${interview.platform}` : null,
      interview.meeting_url ? `Link: ${interview.meeting_url}` : null,
      interview.notes,
    ]
      .filter(Boolean)
      .join("\n"),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    timeZone: interview.timezone,
    location: interview.meeting_url,
    interviewId: interview.id,
  };

  const event = interview.google_event_id
    ? await updateEvent(token, interview.google_event_id, input)
    : await insertEvent(token, input);

  await supabase
    .from("interviews")
    .update({ google_event_id: event.id })
    .eq("id", interview.id)
    .eq("user_id", userId);
  await supabase.from("calendar_events").upsert(
    {
      user_id: userId,
      account_id: account.id,
      interview_id: interview.id,
      google_event_id: event.id,
      google_calendar_id: "primary",
      summary: event.summary ?? input.summary,
      starts_at: event.start?.dateTime ?? input.startIso,
      ends_at: event.end?.dateTime ?? input.endIso,
      timezone: event.start?.timeZone ?? interview.timezone,
      meeting_url: eventMeetingUrl(event) ?? interview.meeting_url,
      html_link: event.htmlLink ?? null,
      status: event.status ?? "confirmed",
      etag: event.etag ?? null,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "user_id,google_calendar_id,google_event_id" },
  );
  return event;
}
