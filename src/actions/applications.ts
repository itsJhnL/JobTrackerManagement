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
import { APPLICATION_STATUS_LABELS } from "@/lib/constants";
import { logActivity } from "@/lib/data/activities";
import { suggestDueDateString } from "@/lib/follow-ups";
import { getProfile } from "@/lib/data/profiles";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import {
  applicationSchema,
  bulkIdsSchema,
  bulkStatusSchema,
  quickApplicationSchema,
  updateApplicationSchema,
  updateStatusSchema,
  type ApplicationValues,
} from "@/lib/validations/application";

function revalidateAll(id?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/applications");
  if (id) revalidatePath(`/applications/${id}`);
}

function toInsert(
  userId: string,
  values: Partial<ApplicationValues>,
): TablesInsert<"applications"> {
  return {
    user_id: userId,
    company_name: values.company_name ?? "",
    job_title: values.job_title ?? "",
    job_url: values.job_url ?? null,
    platform: values.platform ?? null,
    location: values.location ?? null,
    employment_type: values.employment_type ?? null,
    status: values.status ?? "saved",
    job_description: values.job_description ?? null,
    applied_at: values.applied_at ?? null,
    cover_letter: values.cover_letter ?? null,
    screening_answers: values.screening_answers ?? [],
    resume_version: values.resume_version ?? null,
    portfolio_links: values.portfolio_links ?? [],
    application_notes: values.application_notes ?? null,
    offered_rate: values.offered_rate ?? null,
    proposed_rate: values.proposed_rate ?? null,
    negotiated_rate: values.negotiated_rate ?? null,
    minimum_rate: values.minimum_rate ?? null,
    currency: values.currency ?? "USD",
    rate_type: values.rate_type ?? "hourly",
    payment_frequency: values.payment_frequency ?? null,
    hours_per_week: values.hours_per_week ?? null,
    hours_per_day: values.hours_per_day ?? null,
    working_days: values.working_days ?? [],
    work_schedule: values.work_schedule ?? null,
    timezone: values.timezone ?? null,
    shift: values.shift ?? null,
    benefits: values.benefits ?? null,
    notes: values.notes ?? null,
  };
}

/**
 * Creates an application. When the status is "applied" and an applied date is
 * set, a first follow-up is scheduled automatically using the user's intervals.
 */
export async function createApplication(
  input: unknown,
  options: { quick?: boolean; scheduleFollowUp?: boolean } = {},
): Promise<ActionResult<{ id: string }>> {
  const parsed = (options.quick ? quickApplicationSchema : applicationSchema).safeParse(
    input,
  );
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const { user, supabase } = await requireUserForAction();
    const values = parsed.data as Partial<ApplicationValues>;

    const { data, error } = await supabase
      .from("applications")
      .insert(toInsert(user.id, values))
      .select("id, company_name, job_title, status, applied_at")
      .single();
    if (error) return fail(error.message);

    await logActivity(supabase, {
      userId: user.id,
      applicationId: data.id,
      type: "application_created",
      title: `Added ${data.company_name} · ${data.job_title}`,
    });

    if ((options.scheduleFollowUp ?? true) && data.status === "applied") {
      const profile = await getProfile(supabase, user.id);
      const from = data.applied_at ? new Date(data.applied_at + "T12:00:00") : new Date();
      const due = suggestDueDateString(
        "initial_application",
        from,
        profile.follow_up_intervals,
      );
      const { error: fuError } = await supabase.from("follow_ups").insert({
        user_id: user.id,
        application_id: data.id,
        follow_up_type: "initial_application",
        title: `Follow up with ${data.company_name}`,
        due_date: due,
        priority: "medium",
        status: "pending",
        last_contact_date: data.applied_at,
      });
      if (!fuError) {
        await logActivity(supabase, {
          userId: user.id,
          applicationId: data.id,
          type: "follow_up_created",
          title: `Scheduled first follow-up with ${data.company_name}`,
          metadata: { due_date: due },
        });
      }
    }

    revalidateAll(data.id);
    return ok({ id: data.id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function updateApplication(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateApplicationSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const { user, supabase } = await requireUserForAction();
    const { id, ...values } = parsed.data;

    // Only send the keys that were provided so partial edits (inline) are safe.
    const patch = Object.fromEntries(
      Object.entries(toInsert(user.id, values)).filter(([key]) => key in values),
    ) as TablesUpdate<"applications">;

    const { data, error } = await supabase
      .from("applications")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, status, company_name")
      .single();
    if (error) return fail(error.message);

    if ("status" in values && values.status) {
      await logActivity(supabase, {
        userId: user.id,
        applicationId: id,
        type: "status_changed",
        title: `${data.company_name} moved to ${APPLICATION_STATUS_LABELS[data.status]}`,
        metadata: { status: data.status },
      });
    }

    revalidateAll(id);
    return ok({ id });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function updateApplicationStatus(input: unknown): Promise<ActionResult> {
  const parsed = updateStatusSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const { user, supabase } = await requireUserForAction();
    const { id, status, note } = parsed.data;

    const { data: before } = await supabase
      .from("applications")
      .select("status, company_name, applied_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!before) return fail("Application not found.");
    if (before.status === status) return ok(undefined);

    const patch: TablesUpdate<"applications"> = { status };
    if (status === "applied" && !before.applied_at)
      patch.applied_at = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("applications")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return fail(error.message);

    if (note) {
      await supabase
        .from("application_status_history")
        .update({ note })
        .eq("application_id", id)
        .eq("user_id", user.id)
        .eq("new_status", status)
        .order("changed_at", { ascending: false })
        .limit(1);
    }

    await logActivity(supabase, {
      userId: user.id,
      applicationId: id,
      type: "status_changed",
      title: `${before.company_name} moved to ${APPLICATION_STATUS_LABELS[status]}`,
      metadata: { from: before.status, to: status },
    });

    revalidateAll(id);
    return ok(undefined);
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function archiveApplications(
  input: unknown,
  archive = true,
): Promise<ActionResult<{ count: number }>> {
  const parsed = bulkIdsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("applications")
      .update({ archived_at: archive ? new Date().toISOString() : null })
      .in("id", parsed.data.ids)
      .eq("user_id", user.id)
      .select("id, company_name");
    if (error) return fail(error.message);

    await Promise.all(
      (data ?? []).map((a) =>
        logActivity(supabase, {
          userId: user.id,
          applicationId: a.id,
          type: archive ? "application_archived" : "application_restored",
          title: `${archive ? "Archived" : "Restored"} ${a.company_name}`,
        }),
      ),
    );

    revalidateAll();
    parsed.data.ids.forEach((id) => revalidatePath(`/applications/${id}`));
    return ok({ count: data?.length ?? 0 });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function deleteApplications(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = bulkIdsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("applications")
      .delete()
      .in("id", parsed.data.ids)
      .eq("user_id", user.id)
      .select("id");
    if (error) return fail(error.message);
    revalidateAll();
    return ok({ count: data?.length ?? 0 });
  } catch (e) {
    return fromUnknownError(e);
  }
}

export async function bulkUpdateStatus(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = bulkStatusSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const { user, supabase } = await requireUserForAction();
    const { data, error } = await supabase
      .from("applications")
      .update({ status: parsed.data.status })
      .in("id", parsed.data.ids)
      .eq("user_id", user.id)
      .select("id, company_name");
    if (error) return fail(error.message);

    await Promise.all(
      (data ?? []).map((a) =>
        logActivity(supabase, {
          userId: user.id,
          applicationId: a.id,
          type: "status_changed",
          title: `${a.company_name} moved to ${APPLICATION_STATUS_LABELS[parsed.data.status]}`,
          metadata: { to: parsed.data.status },
        }),
      ),
    );

    revalidateAll();
    return ok({ count: data?.length ?? 0 });
  } catch (e) {
    return fromUnknownError(e);
  }
}
