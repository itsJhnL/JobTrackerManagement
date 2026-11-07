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
import { getAiProvider } from "@/lib/ai";
import { AiError } from "@/lib/ai/types";
import { requireUserForAction } from "@/lib/auth";
import {
  INTERVIEW_TYPES,
  type ApplicationStatus,
  APPLICATION_STATUSES,
} from "@/lib/constants";
import { logActivity } from "@/lib/data/activities";
import { getProfile } from "@/lib/data/profiles";
import { getGoogleAccount } from "@/lib/integrations/google/client";
import { decryptSecret } from "@/lib/integrations/google/crypto";
import { GoogleAuthError, revokeToken } from "@/lib/integrations/google/oauth";
import {
  pushInterviewToCalendar,
  syncCalendar,
  syncGmail,
} from "@/lib/integrations/google/sync";
import { uuid } from "@/lib/validations/common";

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

export async function runGmailSync(): Promise<
  ActionResult<{ scanned: number; stored: number; recruiting: number; errors: string[] }>
> {
  try {
    const { user, supabase } = await requireUserForAction();
    const account = await getGoogleAccount(supabase, user.id);
    if (!account || account.status === "revoked")
      return fail("Connect your Google account first.");
    if (!account.scopes.some((s) => s.includes("gmail")))
      return fail("Gmail access was not granted. Reconnect and allow Gmail read access.");
    const profile = await getProfile(supabase, user.id);
    const result = await syncGmail(
      supabase,
      user.id,
      account,
      getAiProvider(),
      profile.default_timezone,
    );
    revalidate();
    return ok({
      scanned: result.scanned,
      stored: result.stored,
      recruiting: result.recruiting,
      errors: result.errors,
    });
  } catch (e) {
    return fail(describe(e));
  }
}

export async function runCalendarSync(): Promise<
  ActionResult<{ fetched: number; upserted: number; cancelled: number }>
> {
  try {
    const { user, supabase } = await requireUserForAction();
    const account = await getGoogleAccount(supabase, user.id);
    if (!account || account.status === "revoked")
      return fail("Connect your Google account first.");
    if (!account.scopes.some((s) => s.includes("calendar")))
      return fail(
        "Calendar access was not granted. Reconnect and allow Calendar access.",
      );
    const result = await syncCalendar(supabase, user.id, account);
    revalidate();
    return ok(result);
  } catch (e) {
    return fail(describe(e));
  }
}

const confirmSchema = z.object({
  id: uuid,
  application_id: uuid,
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

    const { data: app } = await supabase
      .from("applications")
      .select("id, company_name, job_title, status")
      .eq("id", v.application_id)
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

    if (v.log_communication) {
      await supabase.from("communications").insert({
        user_id: user.id,
        application_id: app.id,
        communication_type: "email",
        direction: "inbound",
        subject: email.subject,
        message: email.snippet,
        communication_date: email.received_at ?? new Date().toISOString(),
      });
    }

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
