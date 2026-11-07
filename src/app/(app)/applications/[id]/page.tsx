import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivityTab } from "@/components/applications/detail/activity-tab";
import { ApplicationTab } from "@/components/applications/detail/application-tab";
import { CommunicationTab } from "@/components/applications/detail/communication-tab";
import { CompensationTab } from "@/components/applications/detail/compensation-tab";
import { DetailHeader } from "@/components/applications/detail/detail-header";
import {
  DETAIL_TABS,
  DetailTabs,
  type DetailTab,
} from "@/components/applications/detail/detail-tabs";
import { InterviewsTab } from "@/components/applications/detail/interviews-tab";
import { OverviewTab } from "@/components/applications/detail/overview-tab";
import { TasksTab } from "@/components/applications/detail/tasks-tab";
import { requireUser } from "@/lib/auth";
import { listApplicationActivities } from "@/lib/data/activities";
import { getApplicationDetail } from "@/lib/data/applications";
import { getProfile } from "@/lib/data/profiles";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(
  props: PageProps<"/applications/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select("company_name, job_title")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  return { title: data ? `${data.company_name} · ${data.job_title}` : "Application" };
}

export default async function ApplicationDetailPage(
  props: PageProps<"/applications/[id]">,
) {
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const user = await requireUser();
  const supabase = await createClient();

  const [detail, activities, profile] = await Promise.all([
    getApplicationDetail(supabase, user.id, id),
    listApplicationActivities(supabase, id),
    getProfile(supabase, user.id),
  ]);
  if (!detail) notFound();

  const tabParam = typeof searchParams.tab === "string" ? searchParams.tab : "overview";
  const initialTab: DetailTab = (DETAIL_TABS as readonly string[]).includes(tabParam)
    ? (tabParam as DetailTab)
    : "overview";
  const a = detail.application;
  const openFollowUps = detail.followUps.filter(
    (f) => f.status === "pending" || f.status === "snoozed",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader application={a} />
      <DetailTabs
        initialTab={initialTab}
        counts={{
          communication: openFollowUps + detail.communications.length,
          interviews: detail.interviews.length,
          tasks: detail.assessments.length,
        }}
        panels={{
          overview: <OverviewTab application={a} />,
          application: (
            <ApplicationTab
              application={a}
              screeningAnswers={detail.screeningAnswers}
              documents={detail.documents}
            />
          ),
          compensation: <CompensationTab application={a} />,
          communication: (
            <CommunicationTab
              applicationId={a.id}
              companyName={a.company_name}
              contacts={detail.contacts}
              communications={detail.communications}
              followUps={detail.followUps}
            />
          ),
          interviews: (
            <InterviewsTab
              applicationId={a.id}
              interviews={detail.interviews}
              defaultTimezone={profile.default_timezone}
            />
          ),
          tasks: <TasksTab applicationId={a.id} assessments={detail.assessments} />,
          activity: (
            <ActivityTab
              timeZone={profile.default_timezone}
              statusHistory={detail.statusHistory}
              activities={activities}
            />
          ),
        }}
      />
    </div>
  );
}
