"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, ExternalLink, Plus } from "lucide-react";

import { deleteInterview } from "@/actions/interviews";
import { StatusBadge } from "@/components/applications/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityMenu } from "@/components/shared/entity-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  INTERVIEW_OUTCOME_LABELS,
  INTERVIEW_TYPE_LABELS,
  type InterviewOutcome,
} from "@/lib/constants";
import type { InterviewWithApplication } from "@/lib/data/interviews";
import { formatDateTime, formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

import { InterviewFormDialog, type ApplicationOption } from "./interview-form";

const OUTCOME_STYLES: Record<InterviewOutcome, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  passed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  no_show: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};

interface InterviewsViewProps {
  interviews: InterviewWithApplication[];
  applications: ApplicationOption[];
  defaultTimezone: string;
  now: number;
}

export function InterviewsView({
  interviews,
  applications,
  defaultTimezone,
  now,
}: InterviewsViewProps) {
  const [dialog, setDialog] = useState<{
    open: boolean;
    interview?: InterviewWithApplication;
  }>({ open: false });
  const upcoming = interviews.filter(
    (i) => new Date(i.scheduled_at).getTime() >= now && i.outcome === "pending",
  );
  const past = interviews
    .filter((i) => !upcoming.includes(i))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {interviews.length === 0
            ? "No interviews scheduled."
            : `${upcoming.length} upcoming · ${past.length} past`}
        </p>
        <Button
          size="sm"
          onClick={() => setDialog({ open: true })}
          disabled={applications.length === 0}
        >
          <Plus data-icon="inline-start" /> Schedule interview
        </Button>
      </div>

      {interviews.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No interviews yet"
          description="When an employer invites you to talk, schedule it here to keep the time, link and notes in one place."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <Group
            title="Upcoming"
            items={upcoming}
            onEdit={(i) => setDialog({ open: true, interview: i })}
            emptyText="Nothing scheduled."
          />
          <Group
            title="Past"
            items={past}
            muted
            onEdit={(i) => setDialog({ open: true, interview: i })}
            emptyText="No past interviews."
          />
        </div>
      )}

      <InterviewFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        applicationId={dialog.interview?.application_id ?? applications[0]?.id}
        applications={applications}
        interview={dialog.interview}
        defaultTimezone={defaultTimezone}
      />
    </>
  );
}

function Group({
  title,
  items,
  muted,
  onEdit,
  emptyText,
}: {
  title: string;
  items: InterviewWithApplication[];
  muted?: boolean;
  onEdit: (i: InterviewWithApplication) => void;
  emptyText: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title} <span className="tabular-nums">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul
          className={cn(
            "flex flex-col divide-y rounded-xl border",
            muted && "opacity-80",
          )}
        >
          {items.map((i) => {
            const d = new Date(i.scheduled_at);
            return (
              <li key={i.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex w-14 shrink-0 flex-col items-center rounded-md border bg-muted/40 py-1 text-center">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">
                    {d.toLocaleString("en-US", { month: "short" })}
                  </span>
                  <span className="font-heading text-lg leading-tight font-semibold tabular-nums">
                    {d.getDate()}
                  </span>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {i.application ? (
                      <Link
                        href={`/applications/${i.application.id}?tab=interviews`}
                        className="font-medium hover:underline"
                      >
                        {i.application.company_name}
                      </Link>
                    ) : null}
                    <span className="text-muted-foreground">
                      {i.title ?? INTERVIEW_TYPE_LABELS[i.interview_type]}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("border-transparent", OUTCOME_STYLES[i.outcome])}
                    >
                      {INTERVIEW_OUTCOME_LABELS[i.outcome]}
                    </Badge>
                    {i.application ? <StatusBadge status={i.application.status} /> : null}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(i.scheduled_at)}
                    {i.duration_minutes ? ` · ${i.duration_minutes} min` : ""}
                    {i.timezone ? ` · ${i.timezone}` : ""} ·{" "}
                    {formatTimeAgo(i.scheduled_at)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>{INTERVIEW_TYPE_LABELS[i.interview_type]}</span>
                    {i.platform ? <span>{i.platform}</span> : null}
                    {i.interviewer ? <span>with {i.interviewer}</span> : null}
                    {i.meeting_url ? (
                      <a
                        href={i.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
                      >
                        <ExternalLink className="size-3" /> Join
                      </a>
                    ) : null}
                  </p>
                </div>
                <EntityMenu
                  onEdit={() => onEdit(i)}
                  onDelete={() => deleteInterview(i.id)}
                  deleteTitle="Delete this interview?"
                  size="icon-sm"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
