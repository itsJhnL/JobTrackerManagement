import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { TemplateRow } from "@/lib/supabase/database.types";

export async function listTemplates(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("user_id", userId)
    .order("category")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
