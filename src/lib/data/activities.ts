import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { ActivityRow, Json } from "@/lib/supabase/database.types";
import type { ActivityType } from "@/lib/constants";

export interface ActivityWithApplication extends ActivityRow {
  application: { id: string; company_name: string; job_title: string } | null;
}

export async function listRecentActivities(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 15,
): Promise<ActivityWithApplication[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*, application:applications(id, company_name, job_title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityWithApplication[];
}

export async function listApplicationActivities(
  supabase: SupabaseServerClient,
  applicationId: string,
): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Fire-and-forget activity log; failures never block the user action. */
export async function logActivity(
  supabase: SupabaseServerClient,
  input: {
    userId: string;
    applicationId?: string | null;
    type: ActivityType;
    title: string;
    metadata?: Record<string, Json | undefined>;
  },
) {
  const { error } = await supabase.from("activities").insert({
    user_id: input.userId,
    application_id: input.applicationId ?? null,
    activity_type: input.type,
    title: input.title,
    metadata: (input.metadata ?? {}) as Json,
  });
  if (error) console.error("[activities] failed to log activity", error.message);
}
