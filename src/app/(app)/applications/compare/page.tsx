import type { Metadata } from "next";

import { CompareView } from "@/components/applications/compare/compare-view";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { listApplications } from "@/lib/data/applications";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Compare offers" };

export default async function ComparePage(props: PageProps<"/applications/compare">) {
  const params = await props.searchParams;
  const preselected =
    typeof params.ids === "string" ? params.ids.split(",").filter(Boolean) : [];

  const user = await requireUser();
  const supabase = await createClient();
  const applications = await listApplications(supabase, user.id);

  return (
    <>
      <PageHeader
        title="Compare opportunities"
        description="Side by side on pay, hours and schedule. Every figure stays in its own currency and estimates are labelled."
      />
      <CompareView applications={applications} preselected={preselected} />
    </>
  );
}
