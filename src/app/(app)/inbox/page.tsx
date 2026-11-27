import type { Metadata } from "next";

import { InboxView } from "@/components/inbox/inbox-view";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { listApplicationsForSearch } from "@/lib/data/applications";
import { getIntegrationSummary, listEmailMessages } from "@/lib/data/integrations";
import { listInboxNotifications } from "@/lib/data/notifications";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const user = await requireUser();
  const supabase = await createClient();
  // Inbox and saved confirmations, and filtered mail separately so a flood of
  // job alerts never pushes real emails out of the list.
  const [active, filtered, notifications, applications, summary] = await Promise.all([
    listEmailMessages(supabase, user.id, {
      review: ["pending", "confirmed"],
      limit: 150,
    }),
    listEmailMessages(supabase, user.id, { review: ["dismissed"], limit: 100 }),
    listInboxNotifications(supabase, user.id),
    listApplicationsForSearch(supabase, user.id),
    getIntegrationSummary(supabase, user.id),
  ]);

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Everything that needs your attention: recruiter emails, interviews, offers, hires and application updates. Job alerts are filtered out."
      />
      <InboxView
        emails={[...active, ...filtered]}
        notifications={notifications}
        applications={applications}
        gmailReady={summary.connected && summary.gmail}
        calendarReady={summary.connected && summary.calendar}
        lastGmailSyncAt={summary.lastGmailSyncAt}
      />
    </>
  );
}
