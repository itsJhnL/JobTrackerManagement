import type { Metadata } from "next";

import { ApplicationForm } from "@/components/applications/application-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/data/profiles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New application" };

export default async function NewApplicationPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await getProfile(supabase, user.id);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="New application"
        description="Record everything about the opportunity. Only company and title are required."
        className="mb-6"
      />
      <ApplicationForm
        mode="create"
        defaults={{
          currency: profile.default_currency,
          timezone: profile.default_timezone,
          hoursPerWeek: profile.default_hours_per_week,
        }}
      />
    </div>
  );
}
