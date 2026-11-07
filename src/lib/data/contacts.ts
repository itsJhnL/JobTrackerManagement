import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { ContactRow } from "@/lib/supabase/database.types";
import type { ApplicationStatus } from "@/lib/constants";

export interface ContactWithApplication extends ContactRow {
  application: {
    id: string;
    company_name: string;
    job_title: string;
    status: ApplicationStatus;
  } | null;
}

export async function listContacts(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<ContactWithApplication[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("*, application:applications(id, company_name, job_title, status)")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ContactWithApplication[];
}
