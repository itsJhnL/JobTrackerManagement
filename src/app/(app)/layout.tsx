import { cookies } from "next/headers";

import { QuickAddProvider } from "@/components/applications/quick-add-provider";
import { BackgroundSync } from "@/components/integrations/background-sync";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import type { NotificationItem } from "@/components/layout/notifications";
import { TimezoneProvider } from "@/components/timezone-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth";
import { listApplicationsForSearch } from "@/lib/data/applications";
import { getInboxStatus } from "@/lib/data/integrations";
import { listDueFollowUps } from "@/lib/data/follow-ups";
import { getProfile } from "@/lib/data/profiles";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const supabase = await createClient();
  const cookieStore = await cookies();

  const [profile, searchable, due, inbox] = await Promise.all([
    getProfile(supabase, user.id),
    listApplicationsForSearch(supabase, user.id),
    listDueFollowUps(supabase, user.id, new Date(), { includeUpcomingDays: 2 }),
    getInboxStatus(supabase, user.id),
  ]);

  const emailNotifications: NotificationItem[] = inbox.latestUnread.map((e) => ({
    id: `email-${e.id}`,
    kind: "email",
    title: e.subject ?? "New job email",
    subtitle: e.from_name ?? e.from_email ?? "Gmail",
    href: "/inbox",
    date: e.received_at ?? new Date().toISOString(),
    overdue: false,
  }));

  const followUpNotifications: NotificationItem[] = due.map((f) => ({
    id: f.id,
    kind: "follow_up",
    title: f.title ?? `${f.application?.company_name ?? "Application"} follow-up`,
    subtitle: f.application ? `${f.application.job_title}` : "",
    href: f.application
      ? `/applications/${f.application.id}?tab=communication`
      : "/follow-ups",
    date: f.due_date,
    overdue: f.bucket === "overdue",
  }));
  const notifications = [...emailNotifications, ...followUpNotifications];

  const badges = {
    "/follow-ups": due.filter((f) => f.bucket === "overdue" || f.bucket === "today")
      .length,
    "/inbox": inbox.unread,
  };

  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <TimezoneProvider timeZone={profile.default_timezone}>
      <QuickAddProvider
        defaults={{
          currency: profile.default_currency,
          timezone: profile.default_timezone,
          hoursPerWeek: profile.default_hours_per_week,
        }}
      >
        <SidebarProvider defaultOpen={sidebarOpen}>
          <AppSidebar
            user={{ email: user.email ?? profile.email, fullName: profile.full_name }}
            badges={badges}
          />
          <SidebarInset className="min-w-0">
            <AppHeader applications={searchable} notifications={notifications} />
            <div id="content" className="flex flex-1 flex-col gap-6 p-4 md:p-6">
              {children}
              <BackgroundSync unread={inbox.unread} />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </QuickAddProvider>
    </TimezoneProvider>
  );
}
