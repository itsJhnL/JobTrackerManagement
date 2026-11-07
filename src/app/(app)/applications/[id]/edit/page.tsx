import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ApplicationForm } from "@/components/applications/application-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { getApplication } from "@/lib/data/applications";
import { getProfile } from "@/lib/data/profiles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit application" };

export default async function EditApplicationPage(
  props: PageProps<"/applications/[id]/edit">,
) {
  const { id } = await props.params;
  const user = await requireUser();
  const supabase = await createClient();
  const [application, profile] = await Promise.all([
    getApplication(supabase, user.id, id),
    getProfile(supabase, user.id),
  ]);
  if (!application) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={`Edit · ${application.company_name}`}
        description={application.job_title}
        className="mb-6"
      />
      <ApplicationForm
        mode="edit"
        application={application}
        defaults={{
          currency: profile.default_currency,
          timezone: profile.default_timezone,
          hoursPerWeek: profile.default_hours_per_week,
        }}
      />
    </div>
  );
}
