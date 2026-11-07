import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  APPLICATION_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  RATE_TYPE_LABELS,
} from "@/lib/constants";
import { estimateForApplication } from "@/lib/compensation";
import { listApplications } from "@/lib/data/applications";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Prevent spreadsheet formula injection and escape quotes.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** GET /api/export/csv?archived=1 — downloads the user's applications as CSV. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const includeArchived = new URL(request.url).searchParams.get("archived") === "1";
  const supabase = await createClient();
  const apps = await listApplications(supabase, user.id, { includeArchived });

  const header = [
    "Company",
    "Job title",
    "Status",
    "Platform",
    "Employment type",
    "Location",
    "Job URL",
    "Applied on",
    "Currency",
    "Rate type",
    "Offered rate",
    "Proposed rate",
    "Negotiated rate",
    "Minimum rate",
    "Hours/week",
    "Hours/day",
    "Working days",
    "Schedule",
    "Time zone",
    "Shift",
    "Payment frequency",
    "Est. monthly (same currency)",
    "Next follow-up",
    "Benefits",
    "Notes",
    "Archived",
    "Created",
    "Updated",
  ];

  const lines = apps.map((a) => {
    const est = estimateForApplication(a);
    return [
      a.company_name,
      a.job_title,
      APPLICATION_STATUS_LABELS[a.status],
      a.platform,
      a.employment_type ? EMPLOYMENT_TYPE_LABELS[a.employment_type] : "",
      a.location,
      a.job_url,
      a.applied_at,
      a.currency,
      RATE_TYPE_LABELS[a.rate_type],
      a.offered_rate,
      a.proposed_rate,
      a.negotiated_rate,
      a.minimum_rate,
      a.hours_per_week,
      a.hours_per_day,
      a.working_days.join(" "),
      a.work_schedule,
      a.timezone,
      a.shift,
      a.payment_frequency,
      est.monthly ?? "",
      a.next_follow_up,
      a.benefits,
      a.notes,
      a.archived_at ? "yes" : "no",
      a.created_at,
      a.updated_at,
    ]
      .map(csvCell)
      .join(",");
  });

  const body = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="job-applications-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
