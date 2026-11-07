"use client";

import { useState } from "react";
import { CalendarClock, ExternalLink, Plus } from "lucide-react";

import { TimeAgo } from "@/components/shared/time-ago";
import { deleteInterview } from "@/actions/interviews";
import { InterviewFormDialog } from "@/components/interviews/interview-form";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormat } from "@/components/timezone-provider";
import { AddToCalendarMenuItem } from "@/components/interviews/calendar-menu-item";
import { EntityMenu } from "@/components/shared/entity-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  INTERVIEW_OUTCOME_LABELS,
  INTERVIEW_TYPE_LABELS,
  type InterviewOutcome,
} from "@/lib/constants";
import type { InterviewRow } from "@/lib/supabase/database.types";
import { dateParts } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Section } from "./section";

const OUTCOME_STYLES: Record<InterviewOutcome, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  passed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  no_show: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};

interface InterviewsTabProps {
  applicationId: string;
  interviews: InterviewRow[];
  defaultTimezone?: string;
}

export function InterviewsTab({
  applicationId,
  interviews,
  defaultTimezone,
}: InterviewsTabProps) {
  const [dialog, setDialog] = useState<{ open: boolean; interview?: InterviewRow }>({
    open: false,
  });
  // Captured once per mount; the page re-renders from the server on every mutation anyway.
  const [now] = useState(() => Date.now());
  const upcoming = interviews.filter(
    (i) => new Date(i.scheduled_at).getTime() >= now && i.outcome === "pending",
  );
  const past = interviews
    .filter((i) => !upcoming.includes(i))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  return (
    <>
      <Section
        title="Interviews"
        description={
          interviews.length
            ? `${upcoming.length} upcoming · ${past.length} past`
            : undefined
        }
        action={
          <Button size="sm" variant="outline" onClick={() => setDialog({ open: true })}>
            <Plus data-icon="inline-start" /> Schedule
          </Button>
        }
      >
        {interviews.length === 0 ? (
          <EmptyState
            size="sm"
            icon={CalendarClock}
            title="No interviews yet"
            description="Schedule one when the employer reaches out."
          />
        ) : (
          <div className="flex flex-col gap-5">
            {upcoming.length > 0 ? (
              <InterviewList
                title="Upcoming"
                items={upcoming}
                onEdit={(i) => setDialog({ open: true, interview: i })}
              />
            ) : null}
            {past.length > 0 ? (
              <InterviewList
                title="Past"
                items={past}
                muted
                onEdit={(i) => setDialog({ open: true, interview: i })}
              />
            ) : null}
          </div>
        )}
      </Section>
      <InterviewFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        applicationId={applicationId}
        interview={dialog.interview}
        defaultTimezone={defaultTimezone}
      />
    </>
  );
}

export function InterviewList({
  title,
  items,
  muted,
  onEdit,
}: {
  title?: string;
  items: InterviewRow[];
  muted?: boolean;
  onEdit: (i: InterviewRow) => void;
}) {
  const fmt = useFormat();
  return (
    <div className="flex flex-col gap-2">
      {title ? (
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
      ) : null}
      <ul
        className={cn("flex flex-col divide-y rounded-lg border", muted && "opacity-80")}
      >
        {items.map((i) => {
          const parts = dateParts(i.scheduled_at, fmt.timeZone);
          return (
            <li key={i.id} className="flex items-start gap-3 px-3 py-3">
              <div className="flex w-14 shrink-0 flex-col items-center rounded-md border bg-muted/40 py-1 text-center">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                  {parts.month}
                </span>
                <span className="font-heading text-lg leading-tight font-semibold tabular-nums">
                  {parts.day}
                </span>
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {i.title ?? INTERVIEW_TYPE_LABELS[i.interview_type]}
                  </p>
                  <Badge
                    variant="outline"
                    className={cn("border-transparent", OUTCOME_STYLES[i.outcome])}
                  >
                    {INTERVIEW_OUTCOME_LABELS[i.outcome]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {fmt.dateTime(i.scheduled_at)}
                  {i.duration_minutes ? ` · ${i.duration_minutes} min` : ""}
                  {i.timezone ? ` · ${i.timezone}` : ""}
                  {" · "}
                  <TimeAgo value={i.scheduled_at} />
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
                {i.notes ? (
                  <p className="mt-1.5 line-clamp-4 text-xs whitespace-pre-wrap text-muted-foreground">
                    {i.notes}
                  </p>
                ) : null}
              </div>
              <EntityMenu
                onEdit={() => onEdit(i)}
                onDelete={() => deleteInterview(i.id)}
                deleteTitle="Delete this interview?"
              >
                <AddToCalendarMenuItem interviewId={i.id} synced={!!i.google_event_id} />
              </EntityMenu>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
