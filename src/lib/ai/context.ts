import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/data/profiles";
import { formatDate } from "@/lib/format";

import type { ApplicationContext, ProfileContext } from "./types";

/** Only verified, user-entered profile data goes to the model. */
export function buildProfileContext(profile: Profile): ProfileContext {
  return {
    full_name: profile.full_name,
    professional_summary: profile.professional_summary,
    skills: profile.skills,
    experience: profile.experience,
    projects: profile.projects,
    portfolio_url: profile.portfolio_url,
  };
}

/** Loads an application (scoped to the user) plus the latest communication and follow-up count. */
export async function buildApplicationContext(
  supabase: SupabaseServerClient,
  userId: string,
  applicationId: string,
): Promise<ApplicationContext | null> {
  const { data: app, error } = await supabase
    .from("applications")
    .select("id, company_name, job_title, status, job_description, platform, applied_at")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!app) return null;

  const [{ data: lastComm }, { count }] = await Promise.all([
    supabase
      .from("communications")
      .select("direction, subject, message, communication_date")
      .eq("application_id", applicationId)
      .order("communication_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("application_id", applicationId)
      .eq("status", "completed"),
  ]);

  const lastCommunication = lastComm
    ? `${lastComm.direction === "inbound" ? "They wrote" : "I wrote"} on ${formatDate(lastComm.communication_date)}${lastComm.subject ? ` — "${lastComm.subject}"` : ""}${lastComm.message ? `: ${lastComm.message.slice(0, 600)}` : ""}`
    : null;

  return {
    company_name: app.company_name,
    job_title: app.job_title,
    status: app.status,
    job_description: app.job_description,
    platform: app.platform,
    applied_at: app.applied_at ? formatDate(app.applied_at) : null,
    last_communication: lastCommunication,
    follow_up_count: count ?? 0,
  };
}

/** True when the profile has enough content to ground AI writing. */
export function profileIsUsable(p: ProfileContext) {
  return (
    p.skills.length > 0 ||
    p.experience.length > 0 ||
    p.projects.length > 0 ||
    !!p.professional_summary
  );
}
