import type { SupabaseServerClient } from "@/lib/supabase/server";
import type {
  ApplicationRow,
  ApplicationStatusHistoryRow,
  AssessmentRow,
  CommunicationRow,
  ContactRow,
  DocumentRow,
  FollowUpRow,
  InterviewRow,
} from "@/lib/supabase/database.types";
import { ACTIVE_STATUSES, type ApplicationStatus } from "@/lib/constants";
import type { ScreeningAnswer } from "@/lib/validations/application";

export type Application = ApplicationRow;

/** Row shape used by the applications table: the row plus the next pending follow-up date. */
export interface ApplicationListItem extends ApplicationRow {
  next_follow_up: string | null;
}

export interface ApplicationListOptions {
  includeArchived?: boolean;
  onlyArchived?: boolean;
}

export async function listApplications(
  supabase: SupabaseServerClient,
  userId: string,
  options: ApplicationListOptions = {},
): Promise<ApplicationListItem[]> {
  let query = supabase
    .from("applications")
    .select("*, follow_ups(due_date, status, snoozed_until)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (options.onlyArchived) query = query.not("archived_at", "is", null);
  else if (!options.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const { follow_ups, ...app } = row as ApplicationRow & {
      follow_ups: Pick<FollowUpRow, "due_date" | "status" | "snoozed_until">[] | null;
    };
    const pending = (follow_ups ?? [])
      .filter((f) => f.status === "pending" || f.status === "snoozed")
      .map((f) =>
        f.status === "snoozed" && f.snoozed_until ? f.snoozed_until : f.due_date,
      )
      .sort();
    return { ...app, next_follow_up: pending[0] ?? null };
  });
}

/** Lightweight list for the command palette and selectors. */
export async function listApplicationsForSearch(
  supabase: SupabaseServerClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("applications")
    .select("id, company_name, job_title, status")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export interface ApplicationDetail {
  application: ApplicationRow;
  screeningAnswers: ScreeningAnswer[];
  contacts: ContactRow[];
  communications: CommunicationRow[];
  followUps: FollowUpRow[];
  interviews: InterviewRow[];
  assessments: AssessmentRow[];
  documents: DocumentRow[];
  statusHistory: ApplicationStatusHistoryRow[];
}

export async function getApplicationDetail(
  supabase: SupabaseServerClient,
  userId: string,
  id: string,
): Promise<ApplicationDetail | null> {
  const { data: application, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!application) return null;

  const [
    contacts,
    communications,
    followUps,
    interviews,
    assessments,
    documents,
    statusHistory,
  ] = await Promise.all([
    supabase.from("contacts").select("*").eq("application_id", id).order("created_at"),
    supabase
      .from("communications")
      .select("*")
      .eq("application_id", id)
      .order("communication_date", { ascending: false }),
    supabase.from("follow_ups").select("*").eq("application_id", id).order("due_date"),
    supabase
      .from("interviews")
      .select("*")
      .eq("application_id", id)
      .order("scheduled_at"),
    supabase.from("assessments").select("*").eq("application_id", id).order("deadline"),
    supabase
      .from("documents")
      .select("*")
      .eq("application_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("application_status_history")
      .select("*")
      .eq("application_id", id)
      .order("changed_at", { ascending: false }),
  ]);

  for (const r of [
    contacts,
    communications,
    followUps,
    interviews,
    assessments,
    documents,
    statusHistory,
  ]) {
    if (r.error) throw r.error;
  }

  const screeningAnswers = Array.isArray(application.screening_answers)
    ? (application.screening_answers as unknown[])
        .filter(
          (a): a is { question: string; answer: string } =>
            !!a && typeof a === "object" && "question" in a,
        )
        .map((a) => ({
          question: String(a.question ?? ""),
          answer: String(a.answer ?? ""),
        }))
    : [];

  return {
    application,
    screeningAnswers,
    contacts: contacts.data ?? [],
    communications: communications.data ?? [],
    followUps: followUps.data ?? [],
    interviews: interviews.data ?? [],
    assessments: assessments.data ?? [],
    documents: documents.data ?? [],
    statusHistory: statusHistory.data ?? [],
  };
}

export async function getApplication(
  supabase: SupabaseServerClient,
  userId: string,
  id: string,
) {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface StatusCounts {
  byStatus: Record<ApplicationStatus, number>;
  total: number;
  active: number;
}

export function countByStatus(apps: Pick<ApplicationRow, "status">[]): StatusCounts {
  const byStatus = {
    saved: 0,
    applied: 0,
    viewed: 0,
    responded: 0,
    interview: 0,
    assessment: 0,
    offer: 0,
    hired: 0,
    rejected: 0,
    closed: 0,
  } satisfies Record<ApplicationStatus, number>;
  for (const a of apps) byStatus[a.status] += 1;
  const active = ACTIVE_STATUSES.reduce((n, s) => n + byStatus[s], 0);
  return { byStatus, total: apps.length, active };
}
