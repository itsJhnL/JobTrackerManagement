import type { Metadata } from "next";
import { Plus, Scale } from "lucide-react";

import { ButtonLink } from "@/components/shared/button-link";
import { ApplicationsView } from "@/components/applications/applications-view";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { listApplications } from "@/lib/data/applications";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage(props: PageProps<"/applications">) {
  const params = await props.searchParams;
  const showingArchived = params.archived === "1";
  const initialStatus = typeof params.status === "string" ? params.status : undefined;

  const user = await requireUser();
  const supabase = await createClient();
  const data = await listApplications(supabase, user.id, {
    onlyArchived: showingArchived,
  });

  return (
    <>
      <PageHeader
        title="Applications"
        description={`${data.length} ${showingArchived ? "archived" : "active"} application${data.length === 1 ? "" : "s"}.`}
        actions={
          <>
            <ButtonLink href="/applications/compare" variant="outline">
              <Scale data-icon="inline-start" />
              Compare
            </ButtonLink>
            <ButtonLink href="/applications/new">
              <Plus data-icon="inline-start" />
              New application
            </ButtonLink>
          </>
        }
      />
      <ApplicationsView
        data={data}
        showingArchived={showingArchived}
        initialStatus={initialStatus}
      />
    </>
  );
}
