import type { Metadata } from "next";

import { InboxView } from "@/components/inbox/inbox-view";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { listApplicationsForSearch } from "@/lib/data/applications";
import { getIntegrationSummary, listEmailMessages } from "@/lib/data/integrations";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [emails, applications, summary] = await Promise.all([
    listEmailMessages(supabase, user.id),
    listApplicationsForSearch(supabase, user.id),
    getIntegrationSummary(supabase, user.id),
  ]);

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Recruiting emails detected in Gmail. Review each one before anything is linked, scheduled or changed."
      />
      <InboxView
        emails={emails}
        applications={applications}
        gmailReady={summary.connected && summary.gmail}
        calendarReady={summary.connected && summary.calendar}
        lastGmailSyncAt={summary.lastGmailSyncAt}
      />
    </>
  );
}
