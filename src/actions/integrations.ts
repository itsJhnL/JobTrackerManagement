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
import { AiError } from "@/lib/ai/types";
import { requireUserForAction } from "@/lib/auth";
import {
  INTERVIEW_TYPES,
  type ApplicationStatus,
  APPLICATION_STATUSES,
} from "@/lib/constants";
import { logActivity } from "@/lib/data/activities";
import { getGoogleAccount } from "@/lib/integrations/google/client";
import { decryptSecret } from "@/lib/integrations/google/crypto";
import { GoogleAuthError, revokeToken } from "@/lib/integrations/google/oauth";
import { pushInterviewToCalendar } from "@/lib/integrations/google/sync";
import { uuid } from "@/lib/validations/common";
import { trackCalendarEventSchema } from "@/lib/validations/interview";
import { platformFromMeetingUrl } from "@/lib/integrations/calendar-detect";
import { normalize } from "@/lib/integrations/matching";
import { EMAIL_READ_KEY } from "@/lib/inbox";
import type { Json } from "@/lib/supabase/database.types";
import { EMAIL_RULES_VERSION, platformFromSender } from "@/lib/integrations/email-rules";
import {
  findOrCreateApplication,
  logEmailCommunication,
} from "@/lib/integrations/record-application";

function revalidate() {
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/inbox");
  revalidatePath("/interviews");
  revalidatePath("/settings");
}

function describe(e: unknown) {
  if (e instanceof GoogleAuthError && e.needsReconnect)
    return "Google access was revoked or expired. Reconnect your Google account in Settings → Integrations.";
  if (e instanceof AiError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

export async function disconnectGoogle(): Promise<ActionResult> {
  try {
    const { user, supabase } = await requireUserForAction();
    const account = await getGoogleAccount(supabase, user.id);
    if (!account) return ok(undefined);
    // Best-effort revoke at Google, then delete every token locally (cascades to synced rows).
    for (const enc of [account.refresh_token_enc, account.access_token_enc]) {
      if (enc) {
        try {
          await revokeToken(decryptSecret(enc));
        } catch {
          /* ignore */
        }
      }
    }
    const { error } = await supabase
      .from("integration_accounts")
      .delete()
      .eq("id", account.id)
      .eq("user_id", user.id);
    if (error) return fail(error.message);
    await logActivity(supabase, {
      userId: user.id,
      type: "integration_disconnected",
      title: "Disconnected Google account",
    });
    revalidate();
    return ok(undefined);
  } catch (e) {
    return fromUnknownError(e);
  }
}

const confirmSchema = z
  .object({
    id: uuid,
    /** Existing application, or `new_application` to create one, or neither for "not about a specific job". */
    application_id: uuid.optional(),
    new_application: z
      .object({
        company_name: z.string().trim().min(1, "Enter the company").max(200),
        job_title: z.string().trim().min(1, "Enter the job title").max(200),
      })
      .optional(),
    /** Optional overrides reviewed by the user. */
    create_interview: z.boolean().default(false),
    interview_title: z.string().trim().max(200).optional(),
    interview_type: z.enum(INTERVIEW_TYPES).default("video"),
    scheduled_at: z.string().trim().optional(),
    timezone: z.string().trim().max(80).optional(),
    platform: z.string().trim().max(200).optional(),
    meeting_url: z.string().trim().max(1000).optional(),
    interviewer: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(5000).optional(),
    add_to_calendar: z.boolean().default(false),
    apply_status: z.enum(APPLICATION_STATUSES).nullable().optional(),
    log_communication: z.boolean().default(true),
  })
  .refine((v) => !(v.application_id && v.new_application), {
    message: "Choose an application or create a new one, not both",
  })
  .refine((v) => !v.create_interview || v.application_id || v.new_application, {
    message: "Choose the application for this interview",
  });

/**
 * User-approved handling of a detected email: link it to an application,
 * optionally create the interview (and calendar event) and apply the status.
 */
export async function confirmEmail(
  input: unknown,
): Promise<ActionResult<{ interviewId: string | null }>> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  try {
    const { user, supabase } = await requireUserForAction();
    const { data: email, error } = await supabase
      .from("email_messages")
      .select("*")
      .eq("id", v.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!email) return fail("Email not found.");

    // Not about a specific job: mark it handled without linking anything.
    if (!v.application_id && !v.new_application) {
      const { error: upErr } = await supabase
        .from("email_messages")
        .update({ review_status: "confirmed", application_id: null })
        .eq("id", email.id)
        .eq("user_id", user.id);
      if (upErr) return fail(upErr.message);
      revalidate();
      return ok({ interviewId: null });
    }

    let applicationId = v.application_id ?? null;
    if (v.new_application) {
      // Reuses an application for the same company and role instead of duplicating it.
      const saved = await findOrCreateApplication(
        supabase,
        user.id,
        {
          company_name: v.new_application.company_name,
          job_title: v.new_application.job_title,
          platform: platformFromSender(email.from_email),
          applied_at: email.received_at,
        },
        {
          status: (v.apply_status as ApplicationStatus | null | undefined) ?? "applied",
          source: "an email in your Inbox",
        },
      );
      applicationId = saved.applicationId;
    }

    const { data: app } = await supabase
      .from("applications")
      .select("id, company_name, job_title, status")
      .eq("id", applicationId!)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!app) return fail("Application not found.");

    let interviewId: string | null = email.interview_id;

    if (v.create_interview) {
      if (!v.scheduled_at || Number.isNaN(new Date(v.scheduled_at).getTime()))
        return fail("Enter the interview date and time.");
      // Idempotent: one interview per (application, scheduled_at) from Gmail.
      const { data: existing } = await supabase
        .from("interviews")
        .select("id")
        .eq("user_id", user.id)
        .eq("application_id", app.id)
        .eq("scheduled_at", new Date(v.scheduled_at).toISOString())
        .maybeSingle();
      if (existing) {
        interviewId = existing.id;
      } else {
        const { data: created, error: insErr } = await supabase
          .from("interviews")
          .insert({
            user_id: user.id,
            application_id: app.id,
            title: v.interview_title || null,
            interview_type: v.interview_type,
            scheduled_at: new Date(v.scheduled_at).toISOString(),
            timezone: v.timezone || null,
            platform: v.platform || null,
            meeting_url: v.meeting_url || null,
            interviewer: v.interviewer || null,
            notes: v.notes || null,
            source: "gmail",
          })
          .select("*")
          .single();
        if (insErr) return fail(insErr.message);
        interviewId = created.id;
        await logActivity(supabase, {
          userId: user.id,
          applicationId: app.id,
          type: "interview_scheduled",
          title: `Interview scheduled with ${app.company_name} (from email)`,
        });

        if (v.add_to_calendar) {
          const account = await getGoogleAccount(supabase, user.id);
          if (account && account.scopes.some((s) => s.includes("calendar"))) {
            try {
              await pushInterviewToCalendar(supabase, user.id, account, created, app);
            } catch (e) {
              return fail(
                `Interview saved, but the calendar event failed: ${describe(e)}`,
              );
            }
          }
        }
      }
    }

    if (v.apply_status && v.apply_status !== app.status) {
      await supabase
        .from("applications")
        .update({ status: v.apply_status as ApplicationStatus })
        .eq("id", app.id)
        .eq("user_id", user.id);
    }

    if (v.log_communication)
      await logEmailCommunication(supabase, user.id, app.id, email);

    const { error: upErr } = await supabase
      .from("email_messages")
      .update({
        application_id: app.id,
        review_status: "confirmed",
        interview_id: interviewId,
      })
      .eq("id", email.id)
      .eq("user_id", user.id);
    if (upErr) return fail(upErr.message);

    revalidate();
    revalidatePath(`/applications/${app.id}`);
    return ok({ interviewId });
  } catch (e) {
    return fail(describe(e));
  }
}

export async function dismissEmail(input: unknown): Promise<ActionResult> {
  const parsed = uuid.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { error } = await supabase
      .from("email_messages")
      .update({ review_status: "dismissed" })
      .eq("id", parsed.data)
      .eq("user_id", user.id);
    if (error) return fail(error.message);
    revalidate();
    return ok(undefined);
  } catch (e) {
    return fromUnknownError(e);
  }
}

/** Adds (or updates) an existing interview on Google Calendar after explicit user action. */
export async function addInterviewToCalendar(
  input: unknown,
): Promise<ActionResult<{ eventId: string }>> {
  const parsed = uuid.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const account = await getGoogleAccount(supabase, user.id);
    if (
      !account ||
      account.status === "revoked" ||
      !account.scopes.some((s) => s.includes("calendar"))
    )
      return fail("Connect Google Calendar in Settings → Integrations first.");
    const { data: interview } = await supabase
      .from("interviews")
      .select("*, application:applications(company_name, job_title)")
      .eq("id", parsed.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!interview) return fail("Interview not found.");
    const app = interview.application as {
      company_name: string;
      job_title: string;
    } | null;
    const event = await pushInterviewToCalendar(
      supabase,
      user.id,
      account,
      interview,
      app ?? { company_name: "Interview", job_title: "" },
    );
    revalidate();
    revalidatePath(`/applications/${interview.application_id}`);
    return ok({ eventId: event.id });
  } catch (e) {
    return fail(describe(e));
  }
}

/**
 * Tracks a calendar event as an interview after the user picks (or names) the
 * application. Never duplicates: reuses an interview already linked to the
 * event, and an existing application with the same company and title.
 */
export async function trackCalendarEvent(
  input: unknown,
): Promise<ActionResult<{ interviewId: string; applicationId: string }>> {
  const parsed = trackCalendarEventSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  try {
    const { user, supabase } = await requireUserForAction();
    const { data: event, error: eventError } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("id", v.calendar_event_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (eventError) return fail(eventError.message);
    if (!event || !event.starts_at) return fail("Calendar event not found.");

    // Already tracked (e.g. a sync ran meanwhile): just make sure the link exists.
    const { data: already } = await supabase
      .from("interviews")
      .select("id, application_id")
      .eq("user_id", user.id)
      .eq("google_event_id", event.google_event_id)
      .maybeSingle();
    if (already) {
      await supabase
        .from("calendar_events")
        .update({ interview_id: already.id })
        .eq("id", event.id)
        .eq("user_id", user.id);
      revalidate();
      return ok({ interviewId: already.id, applicationId: already.application_id });
    }

    let applicationId = v.application_id ?? null;
    let companyName = "";
    if (applicationId) {
      const { data: app } = await supabase
        .from("applications")
        .select("id, company_name, status")
        .eq("id", applicationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!app) return fail("Application not found.");
      companyName = app.company_name;
      if (["saved", "applied", "viewed", "responded", "shortlisted"].includes(app.status))
        await supabase
          .from("applications")
          .update({ status: "interview" })
          .eq("id", app.id)
          .eq("user_id", user.id);
    } else if (v.new_application) {
      const { company_name, job_title } = v.new_application;
      companyName = company_name;
      // Reuse an existing application for the same company and role.
      const { data: same } = await supabase
        .from("applications")
        .select("id, company_name, job_title")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .ilike("company_name", company_name.replace(/[%_\\]/g, "\\$&"));
      const match = (same ?? []).find(
        (a) => normalize(a.job_title) === normalize(job_title),
      );
      if (match) applicationId = match.id;
      else {
        const { data: created, error } = await supabase
          .from("applications")
          .insert({
            user_id: user.id,
            company_name,
            job_title,
            status: "interview",
            platform: "Google Calendar",
          })
          .select("id")
          .single();
        if (error) return fail(error.message);
        applicationId = created.id;
        await logActivity(supabase, {
          userId: user.id,
          applicationId,
          type: "application_created",
          title: `Added ${company_name} from a calendar interview`,
        });
      }
    }
    if (!applicationId) return fail("Choose an application.");

    const start = Date.parse(event.starts_at);
    const end = event.ends_at ? Date.parse(event.ends_at) : NaN;
    const minutes = Number.isFinite(end) ? Math.round((end - start) / 60_000) : null;
    const { data: interview, error: insertError } = await supabase
      .from("interviews")
      .insert({
        user_id: user.id,
        application_id: applicationId,
        title: event.summary?.slice(0, 200) ?? null,
        interview_type: v.interview_type,
        scheduled_at: event.starts_at,
        duration_minutes: minutes && minutes > 0 && minutes <= 600 ? minutes : null,
        timezone: event.timezone,
        platform: platformFromMeetingUrl(event.meeting_url),
        meeting_url: event.meeting_url,
        notes: "Added from Google Calendar.",
        source: "calendar",
        google_event_id: event.google_event_id,
      })
      .select("id")
      .single();
    if (insertError) return fail(insertError.message);

    await supabase
      .from("calendar_events")
      .update({ interview_id: interview.id })
      .eq("id", event.id)
      .eq("user_id", user.id);
    await logActivity(supabase, {
      userId: user.id,
      applicationId,
      type: "interview_scheduled",
      title: `Interview${companyName ? ` with ${companyName}` : ""} tracked from Google Calendar`,
    });

    revalidate();
    revalidatePath(`/applications/${applicationId}`);
    return ok({ interviewId: interview.id, applicationId });
  } catch (e) {
    return fail(describe(e));
  }
}

/** Marks detected emails as read (opened). Pass ids, or nothing for all unread. */
export async function markEmailsRead(
  input?: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = z.array(uuid).max(500).optional().safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    let q = supabase
      .from("email_messages")
      .select("id, extracted")
      .eq("user_id", user.id)
      .eq("review_status", "pending")
      .is(`extracted->>${EMAIL_READ_KEY}`, null);
    if (parsed.data) q = q.in("id", parsed.data);
    const { data, error } = await q.limit(500);
    if (error) return fail(error.message);
    const readAt = new Date().toISOString();
    // `extracted` is jsonb: merge the flag into what is already there.
    const results = await Promise.all(
      (data ?? []).map((e) =>
        supabase
          .from("email_messages")
          .update({
            extracted: {
              ...((e.extracted as Record<string, Json> | null) ?? {}),
              [EMAIL_READ_KEY]: readAt,
            },
          })
          .eq("id", e.id)
          .eq("user_id", user.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return fail(failed.error.message);
    revalidatePath("/", "layout");
    return ok({ count: data?.length ?? 0 });
  } catch (e) {
    return fromUnknownError(e);
  }
}

/**
 * Manual correction: puts a filtered email, or a confirmation that was saved
 * to Applications, back in the Inbox. Later syncs leave it there. An
 * application already created from it is kept (archive it if unwanted).
 */
export async function moveEmailToInbox(input: unknown): Promise<ActionResult> {
  const parsed = uuid.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data: email, error } = await supabase
      .from("email_messages")
      .select("id, classification, extracted")
      .eq("id", parsed.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!email) return fail("Email not found.");
    const extracted = (email.extracted as Record<string, Json> | null) ?? {};
    const { error: upErr } = await supabase
      .from("email_messages")
      .update({
        review_status: "pending",
        classification:
          email.classification === "not_recruiting"
            ? "other_recruiting"
            : email.classification,
        extracted: {
          ...extracted,
          destination: "inbox",
          category: null,
          route_reason: "Moved to the Inbox by you",
          manual_override: "inbox",
          rules_version: EMAIL_RULES_VERSION,
        },
      })
      .eq("id", email.id)
      .eq("user_id", user.id);
    if (upErr) return fail(upErr.message);
    revalidate();
    return ok(undefined);
  } catch (e) {
    return fromUnknownError(e);
  }
}
