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
import { INTERVIEW_OUTCOME_LABELS } from "@/lib/constants";
import { logActivity } from "@/lib/data/activities";
import { uuid } from "@/lib/validations/common";
import { interviewSchema, updateInterviewSchema } from "@/lib/validations/interview";

function revalidate(applicationId?: string | null) {
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/interviews");
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
}

export async function createInterview(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = interviewSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("interviews")
      .insert({ ...parsed.data, user_id: user.id })
      .select("id, application_id, application:applications(company_name)")
      .single();
    if (error) return fail(error.message);
    const company =
      (data.application as { company_name: string } | null)?.company_name ??
      "application";
    await logActivity(supabase, {
      userId: user.id,
      applicationId: data.application_id,
      type: "interview_scheduled",
      title: `Interview scheduled with ${company}`,
      metadata: { scheduled_at: parsed.data.scheduled_at },
    });
    // Move the pipeline forward if the application is still early-stage.
    await supabase
      .from("applications")
      .update({ status: "interview" })
      .eq("id", data.application_id)
      .eq("user_id", user.id)
      .in("status", ["saved", "applied", "viewed", "responded"]);
    revalidate(data.application_id);
    return ok({ id: data.id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function updateInterview(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateInterviewSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { id, ...patch } = parsed.data;
    const { data, error } = await supabase
      .from("interviews")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, application_id, outcome, application:applications(company_name)")
      .single();
    if (error) return fail(error.message);
    if (patch.outcome) {
      const company =
        (data.application as { company_name: string } | null)?.company_name ??
        "application";
      await logActivity(supabase, {
        userId: user.id,
        applicationId: data.application_id,
        type: "interview_updated",
        title: `Interview with ${company}: ${INTERVIEW_OUTCOME_LABELS[data.outcome]}`,
      });
    }
    revalidate(data.application_id);
    return ok({ id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function deleteInterview(input: unknown): Promise<ActionResult> {
  const parsed = uuid.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("interviews")
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
