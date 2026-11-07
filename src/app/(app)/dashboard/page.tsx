import type { Metadata } from "next";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { CompensationOverview } from "@/components/dashboard/compensation-overview";
import { FollowUpsPanel } from "@/components/dashboard/follow-ups-panel";
import { IncomeOverview } from "@/components/dashboard/income-overview";
import { Pipeline } from "@/components/dashboard/pipeline";
import { StatCards } from "@/components/dashboard/stat-cards";
import { UpcomingInterviews } from "@/components/dashboard/upcoming-interviews";
import { QuickAddButton } from "@/components/applications/quick-add-button";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/dashboard";
import { getProfile } from "@/lib/data/profiles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await getProfile(supabase, user.id);
  const data = await getDashboardData(supabase, user.id, {
    displayCurrency: profile.display_currency,
    timeZone: profile.default_timezone,
  });

  const firstName = profile.full_name?.split(" ")[0];
  const due = data.followUps.overdue.length + data.followUps.today.length;
  const hello = greeting(profile.default_timezone);

  return (
    <>
      <PageHeader
        title={firstName ? `${hello}, ${firstName}` : hello}
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

      <div className="grid gap-4 *:min-w-0 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
          <div id="income" className="scroll-mt-20">
            <IncomeOverview income={data.income} rates={data.rates} />
          </div>
          <Pipeline byStatus={data.counts.byStatus} total={data.counts.total} />
          <CompensationOverview data={data.pipeline} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <UpcomingInterviews
            interviews={data.upcomingInterviews}
            integrations={data.integrations}
          />
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
