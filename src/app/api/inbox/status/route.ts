import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getInboxStatus } from "@/lib/data/integrations";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/status: unread count and last Gmail sync time.
 * Polled by the app shell so the Inbox badge stays current in every open tab.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const status = await getInboxStatus(supabase, user.id);
  return NextResponse.json(
    { unread: status.unread, lastGmailSyncAt: status.lastGmailSyncAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
