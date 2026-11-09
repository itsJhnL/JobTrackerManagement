import "server-only";

import type { ApplicationStatus } from "@/lib/constants";
import { logActivity } from "@/lib/data/activities";
import type { SupabaseServerClient } from "@/lib/supabase/server";

import { normalize } from "./matching";

type Db = SupabaseServerClient;

export interface ApplicationFacts {
  company_name: string;
  job_title: string;
  platform?: string | null;
  job_url?: string | null;
  /** Stable platform job id (e.g. Indeed job key) used to find the same job. */
  job_key?: string | null;
  location?: string | null;
  applied_at?: string | null;
}

export interface RecordResult {
  applicationId: string;
  created: boolean;
  /** Fields filled in on an existing application. */
  updated: string[];
}

/** Statuses that mean "not applied yet"; a confirmation moves them to applied. */
const NOT_APPLIED: ApplicationStatus[] = ["saved"];

const COLUMNS =
  "id, company_name, job_title, status, job_url, platform, location, applied_at, created_at, archived_at";

type AppRow = {
  id: string;
  company_name: string;
  job_title: string;
  status: ApplicationStatus;
  job_url: string | null;
  platform: string | null;
  location: string | null;
  applied_at: string | null;
  created_at: string;
  archived_at: string | null;
};

/**
 * Every application that is the same job: same platform job key in the URL,
 * or same company and same job title (case and punctuation ignored).
 * Oldest first, so the original record wins.
 */
async function findSameJob(db: Db, userId: string, facts: ApplicationFacts) {
  const found = new Map<string, AppRow>();
  if (facts.job_key && /^[a-z0-9]{8,40}$/i.test(facts.job_key)) {
    const { data, error } = await db
      .from("applications")
      .select(COLUMNS)
      .eq("user_id", userId)
      .ilike("job_url", `%${facts.job_key}%`);
    if (error) throw error;
    for (const a of (data ?? []) as AppRow[]) found.set(a.id, a);
  }
  // Company names vary in suffixes ("Pty Ltd", "Inc."), so compare normalised
  // names in code; a user has at most a few hundred applications.
  const { data, error } = await db
    .from("applications")
    .select(COLUMNS)
    .eq("user_id", userId)
    .is("archived_at", null)
    .limit(2000);
  if (error) throw error;
  const company = normalize(facts.company_name);
  const title = normalize(facts.job_title);
  for (const a of (data ?? []) as AppRow[])
    if (
      company &&
      normalize(a.company_name) === company &&
      normalize(a.job_title) === title
    )
      found.set(a.id, a);
  return [...found.values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

/**
 * Finds the application for this job or creates it, without ever creating a
 * second record for the same job:
 *  - reuses a match by platform job key or by company + title;
 *  - fills in only fields that are empty (never overwrites the user's data);
 *  - moves "saved" to "applied" (a confirmation means it was submitted);
 *  - after inserting, re-checks and keeps the oldest record if another sync
 *    created the same job at the same moment.
 */
export async function findOrCreateApplication(
  db: Db,
  userId: string,
  facts: ApplicationFacts,
  options: { status: ApplicationStatus; source: string },
): Promise<RecordResult> {
  const existing = (await findSameJob(db, userId, facts))[0];
  if (existing) {
    const patch: Partial<
      Pick<AppRow, "job_url" | "platform" | "location" | "status" | "applied_at">
    > = {};
    if (!existing.job_url && facts.job_url) patch.job_url = facts.job_url;
    if (!existing.platform && facts.platform) patch.platform = facts.platform;
    if (!existing.location && facts.location) patch.location = facts.location;
    if (options.status === "applied" && NOT_APPLIED.includes(existing.status)) {
      patch.status = "applied";
      if (!existing.applied_at && facts.applied_at) patch.applied_at = facts.applied_at;
    } else if (!existing.applied_at && facts.applied_at && existing.status !== "saved") {
      patch.applied_at = facts.applied_at;
    }
    if (Object.keys(patch).length) {
      const { error } = await db
        .from("applications")
        .update(patch)
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (error) throw error;
    }
    return { applicationId: existing.id, created: false, updated: Object.keys(patch) };
  }

  const { data: created, error } = await db
    .from("applications")
    .insert({
      user_id: userId,
      company_name: facts.company_name.trim().slice(0, 200),
      job_title: facts.job_title.trim().slice(0, 200),
      status: options.status,
      platform: facts.platform ?? null,
      job_url: facts.job_url ?? null,
      location: facts.location ?? null,
      applied_at: options.status === "saved" ? null : (facts.applied_at ?? null),
    })
    .select("id")
    .single();
  if (error) throw error;

  // Two syncs (e.g. two tabs) can both get here for the same job. The oldest
  // record wins; the newer one is removed before anything references it.
  const same = await findSameJob(db, userId, facts);
  const keeper = same[0];
  if (keeper && keeper.id !== created.id) {
    await db.from("applications").delete().eq("id", created.id).eq("user_id", userId);
    return { applicationId: keeper.id, created: false, updated: [] };
  }

  await logActivity(db, {
    userId,
    applicationId: created.id,
    type: "application_created",
    title:
      `Added ${facts.company_name} · ${facts.job_title} from ${options.source}`.slice(
        0,
        200,
      ),
  });
  return { applicationId: created.id, created: true, updated: [] };
}

/**
 * Adds an inbound email to the application's communication history once.
 * Keyed on subject + date, so re-processing the same email adds nothing.
 */
export async function logEmailCommunication(
  db: Db,
  userId: string,
  applicationId: string,
  email: { subject: string | null; snippet: string | null; received_at: string | null },
) {
  const date = email.received_at ?? new Date().toISOString();
  let q = db
    .from("communications")
    .select("id")
    .eq("user_id", userId)
    .eq("application_id", applicationId)
    .eq("communication_date", date);
  q = email.subject ? q.eq("subject", email.subject) : q.is("subject", null);
  const { data: existing } = await q.limit(1);
  if (existing?.length) return;
  await db.from("communications").insert({
    user_id: userId,
    application_id: applicationId,
    communication_type: "email",
    direction: "inbound",
    subject: email.subject,
    message: email.snippet,
    communication_date: date,
  });
}

/** Serialises async work per key within one process (one sync run). */
export function keyedLock() {
  const tails = new Map<string, Promise<unknown>>();
  return async function run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    tails.set(
      key,
      next.catch(() => {}),
    );
    return next;
  };
}
