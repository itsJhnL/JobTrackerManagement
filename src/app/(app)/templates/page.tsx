import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { TemplatesView } from "@/components/templates/templates-view";
import { requireUser } from "@/lib/auth";
import { listTemplates } from "@/lib/data/templates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const templates = await listTemplates(supabase, user.id);

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable messages and cover letters. Copy, adapt, send from your own email."
      />
      <TemplatesView templates={templates} />
    </>
  );
}
