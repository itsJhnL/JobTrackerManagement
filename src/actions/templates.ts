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
import { uuid } from "@/lib/validations/common";
import { templateSchema, updateTemplateSchema } from "@/lib/validations/template";

export async function createTemplate(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("templates")
      .insert({ ...parsed.data, user_id: user.id })
      .select("id")
      .single();
    if (error) return fail(error.message);
    revalidatePath("/templates");
    return ok({ id: data.id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function updateTemplate(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateTemplateSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { id, ...patch } = parsed.data;
    const { error } = await supabase
      .from("templates")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return fail(error.message);
    revalidatePath("/templates");
    return ok({ id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function deleteTemplate(input: unknown): Promise<ActionResult> {
  const parsed = uuid.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const { error } = await supabase
      .from("templates")
      .delete()
      .eq("id", parsed.data)
      .eq("user_id", user.id);
    if (error) return fail(error.message);
    revalidatePath("/templates");
    return ok(undefined);
  } catch (e) {
    return fromUnknownError(e);
  }
}
