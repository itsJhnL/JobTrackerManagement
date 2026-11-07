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
import { uuid } from "@/lib/validations/common";
import {
  communicationSchema,
  updateCommunicationSchema,
} from "@/lib/validations/communication";

function revalidate(applicationId?: string | null) {
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
}

export async function createCommunication(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = communicationSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("communications")
      .insert({ ...parsed.data, user_id: user.id })
      .select("id, application_id, direction, application:applications(company_name)")
      .single();
    if (error) return fail(error.message);
    const company =
      (data.application as { company_name: string } | null)?.company_name ??
      "application";
    await logActivity(supabase, {
      userId: user.id,
      applicationId: data.application_id,
      type: "communication_logged",
      title:
        data.direction === "inbound"
          ? `Received a response from ${company}`
          : `Logged a message to ${company}`,
    });
    // An inbound message on an early-stage application means the employer responded.
    if (data.direction === "inbound") {
      await supabase
        .from("applications")
        .update({ status: "responded" })
        .eq("id", data.application_id)
        .eq("user_id", user.id)
        .in("status", ["applied", "viewed"]);
    }
    revalidate(data.application_id);
    return ok({ id: data.id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function updateCommunication(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateCommunicationSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { id, ...patch } = parsed.data;
    const { data, error } = await supabase
      .from("communications")
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

export async function deleteCommunication(input: unknown): Promise<ActionResult> {
  const parsed = uuid.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("communications")
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
