import type { Metadata } from "next";

import { FollowUpsView } from "@/components/follow-ups/follow-ups-view";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { listApplicationsForSearch } from "@/lib/data/applications";
import { listFollowUps } from "@/lib/data/follow-ups";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Follow-ups" };

export default async function FollowUpsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [followUps, applications] = await Promise.all([
    listFollowUps(supabase, user.id),
    listApplicationsForSearch(supabase, user.id),
  ]);

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Stay on top of every conversation. Nothing is sent automatically."
      />
      <FollowUpsView followUps={followUps} applications={applications} />
    </>
  );
}
