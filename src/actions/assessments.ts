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
import { ASSESSMENT_STATUS_LABELS } from "@/lib/constants";
import { logActivity } from "@/lib/data/activities";
import { uuid } from "@/lib/validations/common";
import { assessmentSchema, updateAssessmentSchema } from "@/lib/validations/assessment";

function revalidate(applicationId?: string | null) {
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/assessments");
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
}

export async function createAssessment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("assessments")
      .insert({ ...parsed.data, user_id: user.id })
      .select("id, application_id, title")
      .single();
    if (error) return fail(error.message);
    await logActivity(supabase, {
      userId: user.id,
      applicationId: data.application_id,
      type: "assessment_added",
      title: `Added assessment: ${data.title}`,
    });
    await supabase
      .from("applications")
      .update({ status: "assessment" })
      .eq("id", data.application_id)
      .eq("user_id", user.id)
      .in("status", ["saved", "applied", "viewed", "responded"]);
    revalidate(data.application_id);
    return ok({ id: data.id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function updateAssessment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateAssessmentSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { id, ...patch } = parsed.data;
    const completed =
      patch.status === "submitted" ||
      patch.status === "passed" ||
      patch.status === "failed";
    const { data, error } = await supabase
      .from("assessments")
      .update({
        ...patch,
        ...(completed ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, application_id, title, status")
      .single();
    if (error) return fail(error.message);
    if (patch.status) {
      await logActivity(supabase, {
        userId: user.id,
        applicationId: data.application_id,
        type: "assessment_updated",
        title: `${data.title}: ${ASSESSMENT_STATUS_LABELS[data.status]}`,
      });
    }
    revalidate(data.application_id);
    return ok({ id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function deleteAssessment(input: unknown): Promise<ActionResult> {
  const parsed = uuid.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("assessments")
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
