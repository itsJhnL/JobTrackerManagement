import type { Metadata } from "next";

import { AnalyticsView } from "@/components/analytics/analytics-view";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { getAnalytics } from "@/lib/data/analytics";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const data = await getAnalytics(supabase, user.id);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Conversion through the pipeline and what roles are paying. Archived applications are excluded."
      />
      <AnalyticsView data={data} />
    </>
  );
}
