"use client";

import Link from "next/link";
import { CalendarClock, CalendarSync, ExternalLink, Inbox, Mail } from "lucide-react";

import { ButtonLink } from "@/components/shared/button-link";
import { TimeAgo } from "@/components/shared/time-ago";
import { StatusBadge } from "@/components/applications/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormat } from "@/components/timezone-provider";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { INTERVIEW_TYPE_LABELS } from "@/lib/constants";
import type { InterviewWithApplication } from "@/lib/data/interviews";
import type {
  CalendarEventWithInterview,
  IntegrationSummary,
} from "@/lib/data/integrations";
import { dateParts } from "@/lib/format";
import { cn } from "@/lib/utils";

interface UpcomingInterviewsProps {
  interviews: InterviewWithApplication[];
  /** Upcoming events mirrored by Calendar sync. */
  calendarEvents?: CalendarEventWithInterview[];
  integrations: IntegrationSummary;
}

export function UpcomingInterviews({
  interviews,
  calendarEvents = [],
  integrations,
}: UpcomingInterviewsProps) {
  const fmt = useFormat();
  // Events already shown as tracked interviews above are not repeated.
  const shownEventIds = new Set(interviews.map((i) => i.google_event_id).filter(Boolean));
  const otherEvents = calendarEvents
    .filter(
      (e) => !e.interview_id && !shownEventIds.has(e.google_event_id) && e.starts_at,
    )
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming interviews</CardTitle>
        <CardDescription>Shown in {fmt.timeZone.replace(/_/g, " ")}.</CardDescription>
        <CardAction>
          <ButtonLink href="/interviews" variant="ghost" size="sm">
            View all
          </ButtonLink>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {interviews.length === 0 ? (
          <EmptyState
            size="sm"
            icon={CalendarClock}
            title="Nothing scheduled"
            description="Interviews you add, or confirm from Inbox, appear here."
          />
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {interviews.map((i) => {
              const parts = dateParts(i.scheduled_at, fmt.timeZone);
              return (
                <li key={i.id} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="flex w-12 shrink-0 flex-col items-center rounded-md border bg-muted/40 py-1 text-center">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      {parts.month}
                    </span>
                    <span className="font-heading text-base leading-tight font-semibold tabular-nums">
                      {parts.day}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {i.application ? (
                        <Link
                          href={`/applications/${i.application.id}?tab=interviews`}
                          className="truncate font-medium hover:underline"
                        >
                          {i.application.company_name}
                        </Link>
                      ) : null}
                      <span className="truncate text-muted-foreground">
                        {i.title ?? INTERVIEW_TYPE_LABELS[i.interview_type]}
                      </span>
                      {i.application ? (
                        <StatusBadge status={i.application.status} />
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {fmt.time(i.scheduled_at)} · <TimeAgo value={i.scheduled_at} />
                      {i.platform ? ` · ${i.platform}` : ""}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                      {i.meeting_url ? (
                        <a
                          href={i.meeting_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                        >
                          <ExternalLink className="size-3" /> Join
                        </a>
                      ) : null}
                      {i.google_event_id ? (
                        <Badge
                          variant="outline"
                          className="h-4 gap-1 px-1 text-[10px] text-muted-foreground"
                        >
                          <CalendarSync /> On Google Calendar
                        </Badge>
                      ) : null}
                      {i.source === "gmail" ? (
                        <Badge
                          variant="outline"
                          className="h-4 gap-1 px-1 text-[10px] text-muted-foreground"
                        >
                          <Mail /> From email
                        </Badge>
                      ) : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {otherEvents.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t pt-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <CalendarSync className="size-3.5" /> Also on your Google Calendar
            </p>
            <ul className="flex flex-col gap-1 text-xs">
              {otherEvents.map((e) => (
                <li key={e.id} className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {fmt.dateTime(e.starts_at!)}
                  </span>
                  {e.html_link ? (
                    <a
                      href={e.html_link}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate underline-offset-4 hover:underline"
                    >
                      {e.summary ?? "(no title)"}
                    </a>
                  ) : (
                    <span className="truncate">{e.summary ?? "(no title)"}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5 border-t pt-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Integrations</p>
          <Row
            ok={integrations.connected && integrations.gmail}
            label="Gmail"
            detail={
              integrations.connected && integrations.gmail ? (
                <>
                  synced{" "}
                  {integrations.lastGmailSyncAt ? (
                    <TimeAgo value={integrations.lastGmailSyncAt} />
                  ) : (
                    "never"
                  )}
                </>
              ) : (
                "not connected"
              )
            }
          />
          <Row
            ok={integrations.connected && integrations.calendar}
            label="Google Calendar"
            detail={
              integrations.connected && integrations.calendar ? (
                <>
                  synced{" "}
                  {integrations.lastCalendarSyncAt ? (
                    <TimeAgo value={integrations.lastCalendarSyncAt} />
                  ) : (
                    "never"
                  )}
                </>
              ) : (
                "not connected"
              )
            }
          />
          {integrations.lastError ? (
            <p className="text-rose-600 dark:text-rose-400">{integrations.lastError}</p>
          ) : null}
          <div className="mt-1 flex gap-2">
            {integrations.pendingEmails > 0 ? (
              <ButtonLink href="/inbox" size="xs" variant="outline">
                <Inbox /> {integrations.pendingEmails} email
                {integrations.pendingEmails === 1 ? "" : "s"} to review
              </ButtonLink>
            ) : null}
            <ButtonLink href="/settings?tab=integrations" size="xs" variant="ghost">
              Manage
            </ButtonLink>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-2">
      <span
        className={cn(
          "size-1.5 rounded-full",
          ok ? "bg-emerald-500" : "bg-muted-foreground/40",
        )}
      />
      <span className="text-foreground">{label}</span>
      <span>· {detail}</span>
    </p>
  );
}
