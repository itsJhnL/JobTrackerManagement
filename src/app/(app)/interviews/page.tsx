import type { Metadata } from "next";

import { InterviewsView } from "@/components/interviews/interviews-view";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { listApplicationsForSearch } from "@/lib/data/applications";
import { listInterviews } from "@/lib/data/interviews";
import { getProfile } from "@/lib/data/profiles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Interviews" };

/** Captured per request so client lists can compare against "now" without impure calls in render. */
function currentTime() {
  return Date.now();
}

export default async function InterviewsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [interviews, applications, profile] = await Promise.all([
    listInterviews(supabase, user.id),
    listApplicationsForSearch(supabase, user.id),
    getProfile(supabase, user.id),
  ]);

  return (
    <>
      <PageHeader
        title="Interviews"
        description="Every scheduled conversation, with links, time zones and notes."
      />
      <InterviewsView
        interviews={interviews}
        applications={applications}
        defaultTimezone={profile.default_timezone}
        now={currentTime()}
      />
    </>
  );
}
