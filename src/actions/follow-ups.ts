"use server";

import { revalidatePath } from "next/cache";

import {
  fail,
  fromUnknownError,
  fromZodError,
  ok,
  type ActionResult,
} from "@/lib/action-result";
import { requireUserForAction } from "@/lib/auth";
import { logActivity } from "@/lib/data/activities";
import { getProfile } from "@/lib/data/profiles";
import { suggestDueDateString } from "@/lib/follow-ups";
import { todayDateString } from "@/lib/format";
import { uuid } from "@/lib/validations/common";
import {
  completeFollowUpSchema,
  followUpSchema,
  snoozeFollowUpSchema,
  updateFollowUpSchema,
} from "@/lib/validations/follow-up";

function revalidate(applicationId?: string | null) {
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/follow-ups");
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
}

export async function createFollowUp(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = followUpSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("follow_ups")
      .insert({ ...parsed.data, user_id: user.id })
      .select("id, application_id, title, application:applications(company_name)")
      .single();
    if (error) return fail(error.message);

    const company =
      (data.application as { company_name: string } | null)?.company_name ??
      "application";
    await logActivity(supabase, {
      userId: user.id,
      applicationId: data.application_id,
      type: "follow_up_created",
      title: `Scheduled follow-up: ${data.title ?? company}`,
      metadata: { due_date: parsed.data.due_date },
    });

    revalidate(data.application_id);
    return ok({ id: data.id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function updateFollowUp(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateFollowUpSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const { user, supabase } = await requireUserForAction();
    const { id, ...patch } = parsed.data;
    const { data, error } = await supabase
      .from("follow_ups")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, application_id")
      .single();
    if (error) return fail(error.message);
    revalidate(data.application_id);
    return ok({ id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

/**
 * Marks a follow-up as contacted/completed. Optionally schedules the next one
 * using the user's interval settings and increments the follow-up count.
 */
export async function completeFollowUp(
  input: unknown,
): Promise<ActionResult<{ nextId: string | null }>> {
  const parsed = completeFollowUpSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const { user, supabase } = await requireUserForAction();
    const today = todayDateString();

    const { data: current, error: readError } = await supabase
      .from("follow_ups")
      .select("*, application:applications(company_name)")
      .eq("id", parsed.data.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) return fail(readError.message);
    if (!current) return fail("Follow-up not found.");

    const { error } = await supabase
      .from("follow_ups")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        last_contact_date: today,
        follow_up_count: current.follow_up_count + 1,
        notes: parsed.data.note
          ? [current.notes, parsed.data.note].filter(Boolean).join("\n")
          : current.notes,
      })
      .eq("id", current.id)
      .eq("user_id", user.id);
    if (error) return fail(error.message);

    const company =
      (current.application as { company_name: string } | null)?.company_name ??
      "application";
    await logActivity(supabase, {
      userId: user.id,
      applicationId: current.application_id,
      type: "follow_up_completed",
      title: `Followed up with ${company}`,
    });

    let nextId: string | null = null;
    if (parsed.data.scheduleNext) {
      const profile = await getProfile(supabase, user.id);
      const due = suggestDueDateString(
        current.follow_up_type,
        new Date(),
        profile.follow_up_intervals,
        {
          previousCount: current.follow_up_count + 1,
        },
      );
      const { data: next, error: nextError } = await supabase
        .from("follow_ups")
        .insert({
          user_id: user.id,
          application_id: current.application_id,
          follow_up_type: current.follow_up_type,
          title: current.title,
          due_date: due,
          priority: current.priority,
          status: "pending",
          last_contact_date: today,
          follow_up_count: current.follow_up_count + 1,
        })
        .select("id")
        .single();
      if (!nextError) {
        nextId = next.id;
        await logActivity(supabase, {
          userId: user.id,
          applicationId: current.application_id,
          type: "follow_up_created",
          title: `Scheduled next follow-up with ${company}`,
          metadata: { due_date: due },
        });
      }
    }

    revalidate(current.application_id);
    return ok({ nextId });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function snoozeFollowUp(input: unknown): Promise<ActionResult> {
  const parsed = snoozeFollowUpSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("follow_ups")
      .update({
        status: "snoozed",
        snoozed_until: parsed.data.until,
        due_date: parsed.data.until,
      })
      .eq("id", parsed.data.id)
      .eq("user_id", user.id)
      .select("application_id, title, application:applications(company_name)")
      .single();
    if (error) return fail(error.message);

    const company =
      (data.application as { company_name: string } | null)?.company_name ??
      "application";
    await logActivity(supabase, {
      userId: user.id,
      applicationId: data.application_id,
      type: "follow_up_snoozed",
      title: `Snoozed follow-up with ${company}`,
      metadata: { until: parsed.data.until },
    });

    revalidate(data.application_id);
    return ok(undefined);
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function reopenFollowUp(input: unknown): Promise<ActionResult> {
  const parsed = uuid.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("follow_ups")
      .update({ status: "pending", completed_at: null, snoozed_until: null })
      .eq("id", parsed.data)
      .eq("user_id", user.id)
      .select("application_id")
      .single();
    if (error) return fail(error.message);
    revalidate(data.application_id);
    return ok(undefined);
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function deleteFollowUp(input: unknown): Promise<ActionResult> {
  const parsed = uuid.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("follow_ups")
      .delete()
      .eq("id", parsed.data)
      .eq("user_id", user.id)
      .select("application_id")
      .maybeSingle();
    if (error) return fail(error.message);
    revalidate(data?.application_id);
    return ok(undefined);
  } catch (e) {
    return fromUnknownError(e);
  }
}
