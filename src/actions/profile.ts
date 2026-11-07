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
import type { Json } from "@/lib/supabase/database.types";
import { preferencesSchema, profileSchema } from "@/lib/validations/profile";

function revalidate() {
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/ai");
}

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const v = parsed.data;
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: v.full_name,
        professional_summary: v.professional_summary,
        skills: v.skills,
        experience: v.experience as unknown as Json,
        projects: v.projects as unknown as Json,
        portfolio_url: v.portfolio_url,
        resume_url: v.resume_url,
        linkedin_url: v.linkedin_url,
        github_url: v.github_url,
      })
      .eq("id", user.id);
    if (error) return fail(error.message);
    revalidate();
    return ok(undefined);
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function updatePreferences(input: unknown): Promise<ActionResult> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const { user, supabase } = await requireUserForAction();
    const v = parsed.data;
    const { error } = await supabase
      .from("profiles")
      .update({
        default_currency: v.default_currency,
        default_timezone: v.default_timezone,
        default_hours_per_week: v.default_hours_per_week,
        follow_up_intervals: v.follow_up_intervals as unknown as Json,
      })
      .eq("id", user.id);
    if (error) return fail(error.message);
    revalidate();
    return ok(undefined);
  } catch (e) {
    return fromUnknownError(e);
  }
}
