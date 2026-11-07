import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { FollowUpRow } from "@/lib/supabase/database.types";
import { bucketFollowUp, type FollowUpBucket } from "@/lib/follow-ups";
import type { ApplicationStatus } from "@/lib/constants";

export interface FollowUpWithApplication extends FollowUpRow {
  bucket: FollowUpBucket;
  application: {
    id: string;
    company_name: string;
    job_title: string;
    status: ApplicationStatus;
    archived_at: string | null;
  } | null;
}

const SELECT =
  "*, application:applications(id, company_name, job_title, status, archived_at)";

type RawRow = FollowUpRow & { application: FollowUpWithApplication["application"] };

function withBucket(row: RawRow, now: Date): FollowUpWithApplication {
  return { ...row, bucket: bucketFollowUp(row, now) };
}

/** All follow-ups for the user (excluding archived applications), bucketed. */
export async function listFollowUps(
  supabase: SupabaseServerClient,
  userId: string,
  now: Date = new Date(),
): Promise<FollowUpWithApplication[]> {
  const { data, error } = await supabase
    .from("follow_ups")
    .select(SELECT)
    .eq("user_id", userId)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RawRow[])
    .filter((r) => !r.application?.archived_at)
    .map((r) => withBucket(r, now));
}

/** Pending/snoozed follow-ups that are overdue or due today — for notifications and the dashboard. */
export async function listDueFollowUps(
  supabase: SupabaseServerClient,
  userId: string,
  now: Date = new Date(),
  options: { includeUpcomingDays?: number } = {},
) {
  const all = await listFollowUps(supabase, userId, now);
  const horizon = options.includeUpcomingDays ?? 0;
  return all.filter((f) => {
    if (f.bucket === "overdue" || f.bucket === "today") return true;
    if (f.bucket === "upcoming" && horizon > 0) {
      const due = new Date(f.due_date + "T00:00:00");
      const diff = (due.getTime() - new Date(now.toDateString()).getTime()) / 86_400_000;
      return diff <= horizon;
    }
    return false;
  });
}

export async function getFollowUp(
  supabase: SupabaseServerClient,
  userId: string,
  id: string,
) {
  const { data, error } = await supabase
    .from("follow_ups")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? withBucket(data as RawRow, new Date()) : null;
}
