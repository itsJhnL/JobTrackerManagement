import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { AssessmentRow } from "@/lib/supabase/database.types";
import type { ApplicationStatus } from "@/lib/constants";

export interface AssessmentWithApplication extends AssessmentRow {
  application: {
    id: string;
    company_name: string;
    job_title: string;
    status: ApplicationStatus;
    archived_at: string | null;
  } | null;
}

export async function listAssessments(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<AssessmentWithApplication[]> {
  const { data, error } = await supabase
    .from("assessments")
    .select(
      "*, application:applications(id, company_name, job_title, status, archived_at)",
    )
    .eq("user_id", userId)
    .order("deadline", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as AssessmentWithApplication[]).filter(
    (a) => !a.application?.archived_at,
  );
}
