import type { Metadata } from "next";

import { AiAssistant } from "@/components/ai/ai-assistant";
import { PageHeader } from "@/components/shared/page-header";
import { aiStatus } from "@/lib/ai";
import { buildProfileContext, profileIsUsable } from "@/lib/ai/context";
import { requireUser } from "@/lib/auth";
import { listApplicationsForSearch } from "@/lib/data/applications";
import { getProfile } from "@/lib/data/profiles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI Assistant" };

export default async function AiPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [applications, profile] = await Promise.all([
    listApplicationsForSearch(supabase, user.id),
    getProfile(supabase, user.id),
  ]);

  return (
    <>
      <PageHeader
        title="AI Assistant"
        description="Parse job posts, check fit, and draft applications, follow-ups and interview prep from your verified profile."
      />
      <AiAssistant
        applications={applications}
        status={aiStatus()}
        profileReady={profileIsUsable(buildProfileContext(profile))}
      />
    </>
  );
}
