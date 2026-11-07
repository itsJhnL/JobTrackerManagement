import type { Metadata } from "next";

import { AssessmentsView } from "@/components/assessments/assessments-view";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { listApplicationsForSearch } from "@/lib/data/applications";
import { listAssessments } from "@/lib/data/assessments";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assessments" };

/** Captured per request so client lists can compare against "now" without impure calls in render. */
function currentTime() {
  return Date.now();
}

export default async function AssessmentsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [assessments, applications] = await Promise.all([
    listAssessments(supabase, user.id),
    listApplicationsForSearch(supabase, user.id),
  ]);

  return (
    <>
      <PageHeader
        title="Assessments"
        description="Tests, take-home tasks and technical assignments with their deadlines."
      />
      <AssessmentsView
        assessments={assessments}
        applications={applications}
        now={currentTime()}
      />
    </>
  );
}
