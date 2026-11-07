import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { InterviewRow } from "@/lib/supabase/database.types";
import type { ApplicationStatus } from "@/lib/constants";

export interface InterviewWithApplication extends InterviewRow {
  application: {
    id: string;
    company_name: string;
    job_title: string;
    status: ApplicationStatus;
    archived_at: string | null;
  } | null;
}

export async function listInterviews(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<InterviewWithApplication[]> {
  const { data, error } = await supabase
    .from("interviews")
    .select(
      "*, application:applications(id, company_name, job_title, status, archived_at)",
    )
    .eq("user_id", userId)
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as InterviewWithApplication[]).filter(
    (i) => !i.application?.archived_at,
  );
}
