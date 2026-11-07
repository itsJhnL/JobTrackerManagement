import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { parseIntervals } from "@/lib/follow-ups";
import { DEFAULT_FOLLOW_UP_INTERVALS, type FollowUpIntervals } from "@/lib/constants";

export interface ExperienceEntry {
  title: string;
  company: string;
  start: string;
  end: string;
  highlights: string[];
}

export interface ProjectEntry {
  name: string;
  description: string;
  url: string;
  technologies: string[];
}

export interface Profile extends Omit<
  ProfileRow,
  "experience" | "projects" | "follow_up_intervals"
> {
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  follow_up_intervals: FollowUpIntervals;
}

function asArray<T>(json: unknown, guard: (v: unknown) => v is T): T[] {
  return Array.isArray(json) ? json.filter(guard) : [];
}

const isExperience = (v: unknown): v is ExperienceEntry =>
  !!v && typeof v === "object" && "title" in v && "company" in v;
const isProject = (v: unknown): v is ProjectEntry =>
  !!v && typeof v === "object" && "name" in v;

export function normalizeProfile(row: ProfileRow): Profile {
  return {
    ...row,
    experience: asArray(row.experience, isExperience).map((e) => ({
      title: String(e.title ?? ""),
      company: String(e.company ?? ""),
      start: String(e.start ?? ""),
      end: String(e.end ?? ""),
      highlights: Array.isArray(e.highlights) ? e.highlights.map(String) : [],
    })),
    projects: asArray(row.projects, isProject).map((p) => ({
      name: String(p.name ?? ""),
      description: String(p.description ?? ""),
      url: String(p.url ?? ""),
      technologies: Array.isArray(p.technologies) ? p.technologies.map(String) : [],
    })),
    follow_up_intervals: parseIntervals(row.follow_up_intervals),
    display_currency: row.display_currency ?? "PHP",
    default_timezone: row.default_timezone || "Asia/Manila",
  };
}

/** Returns the user's profile, creating a default one if the trigger missed it. */
export async function getProfile(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return normalizeProfile(data);

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({ id: userId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return normalizeProfile(created);
}

export const DEFAULT_PROFILE_SETTINGS = {
  default_currency: "USD",
  default_timezone: "UTC",
  default_hours_per_week: 40,
  follow_up_intervals: DEFAULT_FOLLOW_UP_INTERVALS,
};
