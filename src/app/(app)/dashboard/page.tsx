import type { Metadata } from "next";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { CompensationOverview } from "@/components/dashboard/compensation-overview";
import { FollowUpsPanel } from "@/components/dashboard/follow-ups-panel";
import { Pipeline } from "@/components/dashboard/pipeline";
import { StatCards } from "@/components/dashboard/stat-cards";
import { QuickAddButton } from "@/components/applications/quick-add-button";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/dashboard";
import { getProfile } from "@/lib/data/profiles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [data, profile] = await Promise.all([
    getDashboardData(supabase, user.id),
    getProfile(supabase, user.id),
  ]);

  const firstName = profile.full_name?.split(" ")[0];
  const due = data.followUps.overdue.length + data.followUps.today.length;

  return (
    <>
      <PageHeader
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        description={
          data.counts.total === 0
            ? "Add your first application to get started."
            : due > 0
              ? `${due} follow-up${due === 1 ? "" : "s"} need${due === 1 ? "s" : ""} your attention today.`
              : `${data.counts.active} active application${data.counts.active === 1 ? "" : "s"}. Nothing overdue.`
        }
        actions={<QuickAddButton />}
      />

      <StatCards data={data} />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Pipeline byStatus={data.counts.byStatus} total={data.counts.total} />
          <CompensationOverview data={data.compensation} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <FollowUpsPanel
            overdue={data.followUps.overdue}
            today={data.followUps.today}
            upcoming={data.followUps.upcoming}
          />
          <ActivityFeed activities={data.activities} />
        </div>
      </div>
    </>
  );
}
