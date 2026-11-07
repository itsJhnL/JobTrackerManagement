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
import { contactSchema, updateContactSchema } from "@/lib/validations/contact";

function revalidate(applicationId?: string | null) {
  revalidatePath("/", "layout");
  revalidatePath("/contacts");
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
}

export async function createContact(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("contacts")
      .insert({ ...parsed.data, user_id: user.id })
      .select("id, application_id, name")
      .single();
    if (error) return fail(error.message);
    await logActivity(supabase, {
      userId: user.id,
      applicationId: data.application_id,
      type: "contact_added",
      title: `Added contact ${data.name}`,
    });
    revalidate(data.application_id);
    return ok({ id: data.id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function updateContact(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateContactSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { id, ...patch } = parsed.data;
    const { data, error } = await supabase
      .from("contacts")
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

export async function deleteContact(input: unknown): Promise<ActionResult> {
  const parsed = uuid.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("contacts")
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
