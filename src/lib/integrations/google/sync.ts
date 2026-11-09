import "server-only";

import { AiError, type AiProvider, type EmailAnalysis } from "@/lib/ai/types";
import type { ApplicationStatus } from "@/lib/constants";
import { logActivity } from "@/lib/data/activities";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type {
  EmailMessageRow,
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
import { getMessage, listRecentMessages, type GmailMessage } from "./gmail";
import { detectInterview } from "../calendar-detect";
import { cleanSubject } from "../email-content";
import {
  EMAIL_RULES_VERSION,
  preClassify,
  routeAnalysis,
  type RouteDecision,
  type RuleInput,
} from "../email-rules";
import {
  AUTO_LINK_CONFIDENCE,
  emailDomain,
  matchEmailToApplication,
  normalize,
  type MatchCandidate,
} from "../matching";
import {
  findOrCreateApplication,
  keyedLock,
  logEmailCommunication,
} from "../record-application";

export interface GmailSyncResult {
  scanned: number;
  /** New messages found this run (not yet stored). */
  fresh: number;
  stored: number;
  /** New emails that went to the Inbox for review. */
  recruiting: number;
  /** Application confirmations saved to Applications (not shown in the Inbox). */
  savedToApplications: number;
  /** Applications created from confirmations this run. */
  applicationsCreated: number;
  /** Job alerts, marketing and similar, stored under Filtered. */
  filtered: number;
  /** Previously stored emails re-checked with the current rules. */
  reprocessed: number;
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
/** Stored emails re-checked per run (old rows from before the current rules). */
const REPROCESS_BATCH = 30;

type Candidate = MatchCandidate & { id: string };

/**
 * Pulls recent recruiting-looking messages and files each one:
 *  - fixed rules first (Indeed confirmations, job alerts, the user's own mail),
 *    so those never cost an AI call and never depend on the model;
 *  - the AI classifies the rest, and routeAnalysis() keeps anything uncertain
 *    or from a known company in the Inbox;
 *  - application confirmations are saved to the matching application (created
 *    if needed, never duplicated) instead of the Inbox.
 * Idempotent: (user_id, gmail_message_id) is unique, so re-runs skip stored
 * mail, and saving a confirmation twice finds the same application.
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
    savedToApplications: 0,
    applicationsCreated: 0,
    filtered: 0,
    reprocessed: 0,
    skippedExisting: 0,
    remaining: 0,
    aiUnavailable: null,
    errors: [],
  };
  const token = await getAccessToken(supabase, account);
  const lock = keyedLock();
  const ctx: FileContext = { supabase, userId, lock, result };

  // Emails stored before the current rules (or whose save to Applications
  // failed) are re-checked first; this needs Gmail but no AI.
  await reprocessStoredEmails(ctx, token, account, deadline);

  const summaries = await listRecentMessages(token, {
    newerThanDays: options.newerThanDays ?? 14,
    maxResults: options.maxMessages ?? 40,
  });
  result.scanned = summaries.length;

  const { data: existing } = summaries.length
    ? await supabase
        .from("email_messages")
        .select("gmail_message_id")
        .eq("user_id", userId)
        .in(
          "gmail_message_id",
          summaries.map((m) => m.id),
        )
    : { data: [] };
  const known = new Set((existing ?? []).map((e) => e.gmail_message_id));
  const fresh = summaries.filter((m) => !known.has(m.id));
  result.skippedExisting = summaries.length - fresh.length;
  result.fresh = fresh.length;

  const candidates = fresh.length ? await loadCandidates(supabase, userId) : [];

  const processOne = async (summary: (typeof fresh)[number]) => {
    try {
      const msg = await getMessage(token, summary.id);
      const input = ruleInputFromMessage(msg, account);

      let decision = preClassify(input);
      let analysis: StoredAnalysis;
      let applicationId: string | null = null;
      let matchConfidence: number | null = null;
      let matchInfo: { reason: string; alternatives: { id: string; score: number }[] } = {
        reason: "",
        alternatives: [],
      };

      if (decision) {
        analysis = analysisFromRule(decision, msg.subject);
      } else {
        const ai_ = await ai.classifyEmail({
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
            extracted: { company: ai_.company, job_title: ai_.job_title },
          },
          candidates,
        );
        applicationId = det.applicationId;
        matchConfidence = det.confidence;
        const validModelPick =
          ai_.matched_application_id &&
          candidates.some((c) => c.id === ai_.matched_application_id)
            ? ai_.matched_application_id
            : null;
        if (
          !applicationId &&
          validModelPick &&
          ai_.match_confidence >= AUTO_LINK_CONFIDENCE &&
          det.alternatives.length <= 1
        ) {
          applicationId = validModelPick;
          matchConfidence = ai_.match_confidence;
        }
        matchInfo = { reason: det.reason, alternatives: det.alternatives };
        decision = routeAnalysis(ai_, input, det);
        analysis = ai_;
      }

      const { data: row, error } = await supabase
        .from("email_messages")
        .insert({
          user_id: userId,
          account_id: account.id,
          gmail_message_id: msg.id,
          gmail_thread_id: msg.threadId,
          from_name: msg.from.name,
          from_email: msg.from.email,
          subject: msg.subject,
          snippet: msg.snippet.slice(0, 500),
          received_at: msg.receivedAt,
          classification: decision.kind,
          confidence: analysis.confidence,
          extracted: {
            ...analysis,
            kind: decision.kind,
            match_reason: matchInfo.reason,
            alternatives: matchInfo.alternatives,
            ...routingFields(decision),
          } as unknown as Json,
          application_id: decision.destination === "filtered" ? null : applicationId,
          match_confidence: matchConfidence,
          // Confirmations stay "pending" until they are saved to Applications,
          // so a failed save leaves them visible instead of lost.
          review_status: decision.destination === "filtered" ? "dismissed" : "pending",
          processed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) {
        // Another sync stored this message a moment ago.
        if ((error as { code?: string }).code === "23505") {
          result.skippedExisting += 1;
          return;
        }
        throw error;
      }
      result.stored += 1;
      await fileEmail(ctx, {
        id: row.id,
        subject: msg.subject,
        snippet: msg.snippet,
        received_at: msg.receivedAt,
        applicationId,
        decision,
      });
    } catch (e) {
      if (e instanceof AiError && e.retryable) {
        // Busy or rate limited after retries: stop starting new emails instead of
        // hammering the provider. This email stays unstored and is retried next sync.
        result.aiUnavailable ??= e.message;
        return;
      }
      result.errors.push(`${summary.id}: ${describeError(e)}`);
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

interface FileContext {
  supabase: SupabaseServerClient;
  userId: string;
  lock: ReturnType<typeof keyedLock>;
  result: GmailSyncResult;
}

type StoredAnalysis = Omit<EmailAnalysis, "kind"> & { kind: string };

function ruleInputFromMessage(
  msg: GmailMessage,
  account: IntegrationAccountRow,
): RuleInput {
  return {
    from_email: msg.from.email,
    from_name: msg.from.name,
    subject: msg.subject,
    text: msg.text,
    links: msg.links,
    bulk: msg.bulk,
    received_at: msg.receivedAt,
    account_email: account.account_email,
  };
}

/** The stored analysis for an email decided by a rule (no AI call). */
function analysisFromRule(decision: RouteDecision, subject: string): StoredAnalysis {
  const c = decision.confirmation;
  return {
    kind: decision.kind,
    confidence: 1,
    company: c?.company ?? null,
    job_title: c?.job_title ?? null,
    recruiter_name: null,
    recruiter_email: null,
    interview_start: null,
    interview_end: null,
    interview_timezone: null,
    interview_platform: null,
    meeting_url: null,
    instructions: null,
    suggested_status: c ? "applied" : null,
    summary: c ? confirmationSummary(c) : `${decision.reason}: ${subject}`.slice(0, 300),
    filter_category:
      decision.category && decision.category !== "sent_by_you" ? decision.category : null,
  };
}

/** One readable line for an application confirmation. */
function confirmationSummary(c: NonNullable<RouteDecision["confirmation"]>) {
  return `Application submitted on ${c.platform}${c.company ? ` to ${c.company}` : ""}${c.job_title ? ` for ${c.job_title}` : ""}${c.location ? ` (${c.location})` : ""}.`;
}

/** Routing facts kept in `extracted` (the enum columns cannot hold them). */
function routingFields(decision: RouteDecision) {
  return {
    destination: decision.destination,
    category: decision.category,
    route_reason: decision.reason,
    confirmation: decision.confirmation ?? null,
    rules_version: EMAIL_RULES_VERSION,
  };
}

/**
 * Acts on a stored email's routing decision: saves confirmations to their
 * application, logs Inbox arrivals, counts filtered mail.
 */
async function fileEmail(
  ctx: FileContext,
  email: {
    id: string;
    subject: string | null;
    snippet: string | null;
    received_at: string | null;
    applicationId: string | null;
    decision: RouteDecision;
  },
) {
  const { supabase, userId, result } = ctx;
  const { decision } = email;

  if (decision.destination === "filtered") {
    result.filtered += 1;
    return;
  }

  if (decision.destination === "applications" && decision.confirmation) {
    const c = decision.confirmation;
    try {
      const key = c.job_key ?? `${normalize(c.company)}|${normalize(c.job_title)}`;
      const saved = await ctx.lock(key, () =>
        findOrCreateApplication(
          supabase,
          userId,
          {
            company_name: c.company!,
            job_title: c.job_title!,
            platform: c.platform,
            job_url: c.job_url,
            job_key: c.job_key,
            location: c.location,
            applied_at: c.applied_at,
          },
          { status: "applied", source: `a ${c.platform} confirmation email` },
        ),
      );
      // Gmail's preview of automated receipts is often template padding; log a readable summary.
      await logEmailCommunication(supabase, userId, saved.applicationId, {
        ...email,
        snippet: confirmationSummary(c),
      });
      const { error } = await supabase
        .from("email_messages")
        .update({
          application_id: saved.applicationId,
          match_confidence: 1,
          review_status: "confirmed",
        })
        .eq("id", email.id)
        .eq("user_id", userId);
      if (error) throw error;
      result.savedToApplications += 1;
      if (saved.created) result.applicationsCreated += 1;
      if (!saved.created)
        await logActivity(supabase, {
          userId,
          applicationId: saved.applicationId,
          type: "email_detected",
          title: `Application confirmation received: ${email.subject ?? ""}`.slice(
            0,
            200,
          ),
        });
    } catch (e) {
      // Leave it in the Inbox (still pending) with the reason; the next sync retries.
      result.errors.push(
        `${email.id}: could not save to Applications: ${describeError(e)}`,
      );
      result.recruiting += 1;
    }
    return;
  }

  result.recruiting += 1;
  await logActivity(supabase, {
    userId,
    applicationId: email.applicationId,
    type: "email_detected",
    title: `${labelFor(decision.kind)} detected: ${email.subject ?? ""}`.slice(0, 200),
  });
}

async function loadCandidates(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<Candidate[]> {
  const { data: apps } = await supabase
    .from("applications")
    .select("id, company_name, job_title, job_url, contacts(email)")
    .eq("user_id", userId)
    .is("archived_at", null);
  return (apps ?? []).map((a) => ({
    id: a.id,
    company_name: a.company_name,
    job_title: a.job_title,
    contact_emails: ((a.contacts as { email: string | null }[] | null) ?? [])
      .map((c) => c.email)
      .filter((e): e is string => !!e),
    domains: domainFromUrl(a.job_url),
  }));
}

/**
 * Re-checks Inbox emails stored before the current rules, and retries
 * confirmations whose save to Applications failed. Never touches an email the
 * user moved or confirmed by hand. Bounded per run; no AI calls.
 */
async function reprocessStoredEmails(
  ctx: FileContext,
  token: string,
  account: IntegrationAccountRow,
  deadline: number,
) {
  const { supabase, userId, result } = ctx;
  const columns =
    "id, gmail_message_id, gmail_thread_id, from_email, from_name, subject, snippet, received_at, classification, confidence, extracted";
  const [legacy, stuck] = await Promise.all([
    supabase
      .from("email_messages")
      .select(columns)
      .eq("user_id", userId)
      .eq("review_status", "pending")
      .is("extracted->>rules_version", null)
      .order("received_at", { ascending: false })
      .limit(REPROCESS_BATCH),
    supabase
      .from("email_messages")
      .select(columns)
      .eq("user_id", userId)
      .eq("review_status", "pending")
      .eq("extracted->>destination", "applications")
      .limit(REPROCESS_BATCH),
  ]);
  if (legacy.error) throw legacy.error;
  if (stuck.error) throw stuck.error;
  const rows = [...(legacy.data ?? []), ...(stuck.data ?? [])];

  for (const row of rows) {
    if (Date.now() >= deadline) break;
    const extracted = (row.extracted ?? {}) as Record<string, unknown>;
    if (extracted.manual_override) continue;
    try {
      const subject = cleanSubject(row.subject);
      let decision: RouteDecision | null = null;
      const isOwn =
        !!row.from_email &&
        !!account.account_email &&
        row.from_email.toLowerCase() === account.account_email.toLowerCase();

      if (isOwn) {
        // Your reply is only filed away when the other side of the conversation
        // is already in the app. Otherwise it is the only trace of that thread
        // (e.g. the recruiter wrote before the sync window), so it stays visible.
        const { data: others } = row.gmail_thread_id
          ? await supabase
              .from("email_messages")
              .select("id")
              .eq("user_id", userId)
              .eq("gmail_thread_id", row.gmail_thread_id)
              .neq("from_email", row.from_email!)
              .limit(1)
          : { data: [] };
        decision = others?.length
          ? preClassify({
              from_email: row.from_email,
              subject,
              text: "",
              received_at: row.received_at ?? new Date().toISOString(),
              account_email: account.account_email,
            })
          : {
              kind: row.classification ?? "other_recruiting",
              destination: "inbox",
              category: null,
              reason:
                "Your own reply. The recruiter's message in this thread is not in the app, so it stays here; dismiss it when you no longer need it.",
            };
      } else if (
        row.classification === "application_confirmation" ||
        extracted.destination === "applications" ||
        /(?:^|\.)indeed\.com$/.test(emailDomain(row.from_email) ?? "")
      ) {
        // Re-read the full message: the stored snippet lacks what the rules need.
        let msg: GmailMessage | null = null;
        try {
          msg = await getMessage(token, row.gmail_message_id);
        } catch {
          msg = null; // deleted in Gmail: judge from what is stored
        }
        const input: RuleInput = msg
          ? ruleInputFromMessage(msg, account)
          : {
              from_email: row.from_email,
              subject,
              text: row.snippet ?? "",
              received_at: row.received_at ?? new Date().toISOString(),
              account_email: account.account_email,
            };
        decision = preClassify(input);
        if (!decision && row.classification === "application_confirmation")
          decision = routeAnalysis(
            {
              kind: "application_confirmation",
              confidence: Number(row.confidence ?? 0),
              company: (extracted.company as string | null) ?? null,
              job_title: (extracted.job_title as string | null) ?? null,
            },
            input,
            { applicationId: null, confidence: 0, reason: "" },
          );
      }

      const patch: Partial<EmailMessageRow> = {
        extracted: {
          ...extracted,
          ...(decision
            ? {
                ...routingFields(decision),
                kind: decision.kind,
                ...(decision.confirmation
                  ? {
                      company: decision.confirmation.company,
                      job_title: decision.confirmation.job_title,
                    }
                  : {}),
              }
            : { rules_version: EMAIL_RULES_VERSION }),
        } as unknown as Json,
      };
      if (subject !== row.subject) patch.subject = subject;
      if (decision) {
        patch.classification = decision.kind;
        if (decision.destination === "filtered") patch.review_status = "dismissed";
      }
      const { error } = await supabase
        .from("email_messages")
        .update(patch)
        .eq("id", row.id)
        .eq("user_id", userId);
      if (error) throw error;
      result.reprocessed += 1;

      if (decision?.destination === "applications") {
        await fileEmail(ctx, {
          id: row.id,
          subject,
          snippet: row.snippet,
          received_at: row.received_at,
          applicationId: null,
          decision,
        });
      }
    } catch (e) {
      result.errors.push(`${row.gmail_message_id}: ${describeError(e)}`);
    }
  }
}

function describeError(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String(e.message);
  return String(e);
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
  /** Interviews created from calendar events this run. */
  interviewsCreated: number;
  /** Interviews you had already logged (by hand or from email) that were linked to their event. */
  interviewsLinked: number;
  /** Linked interviews whose time, link, length or status changed. */
  interviewsUpdated: number;
  /** Interview-like events that matched no application; offered as suggestions. */
  unmatched: number;
}

/** Window mirrored from Google Calendar. Past days let completed interviews be recorded. */
const CALENDAR_PAST_DAYS = 30;
const CALENDAR_FUTURE_DAYS = 90;
/** An interview already logged this close to an event's start is treated as the same one. */
const SAME_INTERVIEW_WINDOW_MS = 3 * 60 * 60 * 1000;
/** Statuses that move to "interview" once an interview is found on the calendar. */
const PRE_INTERVIEW_STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "viewed",
  "responded",
  "shortlisted",
];

const INTERVIEW_COLUMNS =
  "id, application_id, scheduled_at, google_event_id, meeting_url, duration_minutes, outcome";

type TrackedInterview = Pick<
  InterviewRow,
  | "id"
  | "application_id"
  | "scheduled_at"
  | "google_event_id"
  | "meeting_url"
  | "duration_minutes"
  | "outcome"
>;

/**
 * Mirrors Google Calendar events into calendar_events and keeps interviews in
 * step with them:
 *  - events the app created, or already linked, update their interview
 *    (reschedule, new meeting link, length, cancellation);
 *  - other events that are clearly interviews with a confidently matched
 *    application become interviews automatically (source "calendar"), reusing
 *    an interview already logged around the same time instead of duplicating it;
 *  - interview-like events with no matching application are left for the user
 *    to confirm (see suggestions on the Interviews page).
 * Idempotent: events are keyed on google_event_id, so re-running changes nothing.
 */
export async function syncCalendar(
  supabase: SupabaseServerClient,
  userId: string,
  account: IntegrationAccountRow,
): Promise<CalendarSyncResult> {
  const token = await getAccessToken(supabase, account);
  const events = (
    await listUpcomingEvents(token, {
      days: CALENDAR_FUTURE_DAYS,
      pastDays: CALENDAR_PAST_DAYS,
    })
  ).filter((e) => e.id);

  const [interviewsRes, appsRes] = await Promise.all([
    supabase.from("interviews").select(INTERVIEW_COLUMNS).eq("user_id", userId),
    supabase
      .from("applications")
      .select("id, company_name, job_title, job_url, status, contacts(email)")
      .eq("user_id", userId)
      .is("archived_at", null),
  ]);
  if (interviewsRes.error) throw interviewsRes.error;
  if (appsRes.error) throw appsRes.error;
  const interviews: TrackedInterview[] = interviewsRes.data ?? [];
  const apps = appsRes.data ?? [];

  const byId = new Map(interviews.map((i) => [i.id, i]));
  const byEvent = new Map(
    interviews.filter((i) => i.google_event_id).map((i) => [i.google_event_id!, i]),
  );
  const appsById = new Map(apps.map((a) => [a.id, a]));
  const candidates = apps.map((a) => ({
    id: a.id,
    company_name: a.company_name,
    job_title: a.job_title,
    contact_emails: ((a.contacts as { email: string | null }[] | null) ?? [])
      .map((c) => c.email)
      .filter((e): e is string => !!e),
    domains: domainFromUrl(a.job_url),
  }));

  const result: CalendarSyncResult = {
    fetched: events.length,
    upserted: 0,
    cancelled: 0,
    interviewsCreated: 0,
    interviewsLinked: 0,
    interviewsUpdated: 0,
    unmatched: 0,
  };
  const rows = [];

  for (const e of events) {
    const timed = !!e.start?.dateTime;
    const startsAt =
      e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00Z` : null);
    const endsAt = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00Z` : null);
    const meetingUrl = eventMeetingUrl(e);
    const isCancelled = e.status === "cancelled";
    if (isCancelled) result.cancelled += 1;
    const minutes =
      timed && startsAt && endsAt
        ? Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000)
        : null;
    const duration = minutes && minutes > 0 && minutes <= 600 ? minutes : null;

    const propId = e.extendedProperties?.private?.[APP_EVENT_KEY];
    let linked: TrackedInterview | null =
      (propId ? byId.get(propId) : undefined) ?? byEvent.get(e.id) ?? null;

    if (linked) {
      // Keep an already-linked interview in step with its event.
      const patch: Partial<InterviewRow> = {};
      if (isCancelled) {
        if (linked.outcome === "pending") patch.outcome = "cancelled";
      } else if (startsAt) {
        if (Date.parse(linked.scheduled_at) !== Date.parse(startsAt))
          patch.scheduled_at = startsAt;
        if (meetingUrl && meetingUrl !== linked.meeting_url)
          patch.meeting_url = meetingUrl;
        if (duration && duration !== linked.duration_minutes)
          patch.duration_minutes = duration;
      }
      if (linked.google_event_id !== e.id) patch.google_event_id = e.id;
      if (Object.keys(patch).length) {
        const { error } = await supabase
          .from("interviews")
          .update(patch)
          .eq("id", linked.id)
          .eq("user_id", userId);
        if (error) throw error;
        Object.assign(linked, patch);
        if (Object.keys(patch).some((k) => k !== "google_event_id"))
          result.interviewsUpdated += 1;
      }
    } else if (!isCancelled && timed && startsAt) {
      const detection = detectInterview(
        {
          summary: e.summary ?? null,
          description: e.description ?? null,
          location: e.location ?? null,
          meetingUrl,
          allDay: !timed,
          organizer: e.organizer ?? null,
          attendees: e.attendees ?? [],
        },
        candidates,
      );

      if (detection.autoTrack && detection.applicationId) {
        const applicationId = detection.applicationId;
        // Reuse an interview already logged for this application around this time.
        const existing = interviews.find(
          (i) =>
            i.application_id === applicationId &&
            !i.google_event_id &&
            Math.abs(Date.parse(i.scheduled_at) - Date.parse(startsAt)) <=
              SAME_INTERVIEW_WINDOW_MS,
        );
        if (existing) {
          const patch: Partial<InterviewRow> = {
            google_event_id: e.id,
            scheduled_at: startsAt,
            ...(meetingUrl && !existing.meeting_url ? { meeting_url: meetingUrl } : {}),
            ...(duration && !existing.duration_minutes
              ? { duration_minutes: duration }
              : {}),
          };
          const { error } = await supabase
            .from("interviews")
            .update(patch)
            .eq("id", existing.id)
            .eq("user_id", userId);
          if (error) throw error;
          Object.assign(existing, patch);
          byEvent.set(e.id, existing);
          linked = existing;
          result.interviewsLinked += 1;
        } else {
          const { data: created, error } = await supabase
            .from("interviews")
            .insert({
              user_id: userId,
              application_id: applicationId,
              title: e.summary?.slice(0, 200) ?? null,
              interview_type: detection.interviewType,
              scheduled_at: startsAt,
              duration_minutes: duration,
              timezone: e.start?.timeZone ?? null,
              platform: detection.platform,
              meeting_url: meetingUrl,
              interviewer: detection.interviewer?.slice(0, 200) ?? null,
              notes: "Added automatically from Google Calendar.",
              source: "calendar",
              google_event_id: e.id,
            })
            .select(INTERVIEW_COLUMNS)
            .single();
          if (error) throw error;
          interviews.push(created);
          byId.set(created.id, created);
          byEvent.set(e.id, created);
          linked = created;
          result.interviewsCreated += 1;

          const app = appsById.get(applicationId);
          await logActivity(supabase, {
            userId,
            applicationId,
            type: "interview_scheduled",
            title: `Interview${app ? ` with ${app.company_name}` : ""} found on Google Calendar`,
            metadata: { google_event_id: e.id },
          });
          // Keep the pipeline consistent: an interview means the application reached that stage.
          if (app && PRE_INTERVIEW_STATUSES.includes(app.status)) {
            const { error: statusError } = await supabase
              .from("applications")
              .update({ status: "interview" })
              .eq("id", applicationId)
              .eq("user_id", userId);
            if (!statusError) {
              await logActivity(supabase, {
                userId,
                applicationId,
                type: "status_changed",
                title: `${app.company_name}: status moved to Interview (from Google Calendar)`,
              });
              app.status = "interview";
            }
          }
        }
      } else if (detection.isInterview) {
        result.unmatched += 1;
      }
    }

    rows.push({
      user_id: userId,
      account_id: account.id,
      interview_id: linked?.id ?? null,
      google_event_id: e.id,
      google_calendar_id: "primary",
      summary: e.summary ?? null,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: e.start?.timeZone ?? null,
      meeting_url: meetingUrl,
      html_link: e.htmlLink ?? null,
      status: e.status ?? null,
      etag: e.etag ?? null,
      synced_at: new Date().toISOString(),
    });
  }

  if (rows.length) {
    const { error } = await supabase
      .from("calendar_events")
      .upsert(rows, { onConflict: "user_id,google_calendar_id,google_event_id" });
    if (error) throw error;
  }
  result.upserted = rows.length;

  await touch(supabase, account.id, {
    last_calendar_sync_at: new Date().toISOString(),
    status: "connected",
    last_error: null,
  });
  // Only log when something changed, so background syncs don't flood the activity feed.
  const parts = [
    result.interviewsCreated ? `${result.interviewsCreated} interview(s) added` : null,
    result.interviewsLinked ? `${result.interviewsLinked} linked` : null,
    result.interviewsUpdated ? `${result.interviewsUpdated} updated` : null,
  ].filter(Boolean);
  if (parts.length) {
    await logActivity(supabase, {
      userId,
      type: "calendar_synced",
      title: `Calendar synced: ${parts.join(", ")}`,
    });
  }
  return result;
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
