"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing, Plus } from "lucide-react";

import type { ApplicationOption } from "@/components/interviews/interview-form";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FOLLOW_UP_TYPE_LABELS, PRIORITY_STYLES } from "@/lib/constants";
import type { FollowUpWithApplication } from "@/lib/data/follow-ups";
import type { FollowUpBucket } from "@/lib/follow-ups";
import { formatDate, formatRelativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

import { FollowUpActions } from "./follow-up-actions";
import { FollowUpFormDialog } from "./follow-up-form";
import { StatusBadge } from "@/components/applications/status-badge";

const VIEWS: { key: FollowUpBucket; label: string }[] = [
  { key: "today", label: "Due today" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "snoozed", label: "Snoozed" },
  { key: "completed", label: "Completed" },
];

interface FollowUpsViewProps {
  followUps: FollowUpWithApplication[];
  applications: ApplicationOption[];
}

export function FollowUpsView({ followUps, applications }: FollowUpsViewProps) {
  const [dialog, setDialog] = useState<{
    open: boolean;
    followUp?: FollowUpWithApplication;
  }>({ open: false });
  const groups = Object.fromEntries(
    VIEWS.map((v) => [v.key, followUps.filter((f) => f.bucket === v.key)]),
  ) as Record<FollowUpBucket, FollowUpWithApplication[]>;
  const defaultTab = groups.today.length
    ? "today"
    : groups.overdue.length
      ? "overdue"
      : "upcoming";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {followUps.length === 0
            ? "Follow-ups are created automatically when you mark an application as applied, or schedule them yourself."
            : `${groups.overdue.length} overdue · ${groups.today.length} due today · ${groups.upcoming.length} upcoming`}
        </p>
        <Button
          size="sm"
          onClick={() => setDialog({ open: true })}
          disabled={applications.length === 0}
        >
          <Plus data-icon="inline-start" /> Schedule follow-up
        </Button>
      </div>

      <Tabs defaultValue={defaultTab} className="gap-4">
        <div className="-mx-4 scrollbar-thin overflow-x-auto px-4 md:-mx-6 md:px-6">
          <TabsList variant="line" className="h-9 w-max gap-2 border-b pb-0">
            {VIEWS.map((v) => (
              <TabsTrigger key={v.key} value={v.key} className="h-8 px-2 pb-2.5">
                {v.label}
                <span
                  className={cn(
                    "ml-1 rounded-sm px-1 text-[10px] tabular-nums",
                    v.key === "overdue" && groups[v.key].length
                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-300"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {groups[v.key].length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {VIEWS.map((v) => (
          <TabsContent key={v.key} value={v.key}>
            {groups[v.key].length === 0 ? (
              <EmptyState
                icon={BellRing}
                title={
                  v.key === "overdue"
                    ? "Nothing overdue"
                    : v.key === "today"
                      ? "Nothing due today"
                      : `No ${v.label.toLowerCase()} follow-ups`
                }
                description={
                  v.key === "completed"
                    ? "Completed follow-ups will be listed here."
                    : "You're on top of it."
                }
              />
            ) : (
              <ul className="flex flex-col divide-y rounded-xl border">
                {groups[v.key].map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={
                            f.application
                              ? `/applications/${f.application.id}?tab=communication`
                              : "#"
                          }
                          className="truncate font-medium hover:underline"
                        >
                          {f.application?.company_name ?? "Application"}
                        </Link>
                        <span className="truncate text-sm text-muted-foreground">
                          {f.application?.job_title}
                        </span>
                        {f.application ? (
                          <StatusBadge status={f.application.status} />
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm">
                        {f.title ?? FOLLOW_UP_TYPE_LABELS[f.follow_up_type]}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className={PRIORITY_STYLES[f.priority]}>{f.priority}</span>
                        <span>{FOLLOW_UP_TYPE_LABELS[f.follow_up_type]}</span>
                        <span
                          className={cn(
                            "tabular-nums",
                            f.bucket === "overdue" &&
                              "font-medium text-rose-600 dark:text-rose-400",
                            f.bucket === "today" &&
                              "font-medium text-amber-600 dark:text-amber-400",
                          )}
                        >
                          {f.bucket === "snoozed"
                            ? `Snoozed until ${formatRelativeDay(f.snoozed_until)}`
                            : f.bucket === "completed"
                              ? `Completed ${formatDate(f.completed_at)}`
                              : `Due ${formatRelativeDay(f.due_date)}`}
                        </span>
                        {f.last_contact_date ? (
                          <span>· last contact {formatDate(f.last_contact_date)}</span>
                        ) : null}
                        {f.follow_up_count > 0 ? (
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">
                            #{f.follow_up_count + 1}
                          </Badge>
                        ) : null}
                      </p>
                      {f.message_draft ? (
                        <p className="mt-1.5 line-clamp-2 rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap text-muted-foreground">
                          {f.message_draft}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 self-end sm:self-start">
                      <FollowUpActions
                        id={f.id}
                        status={f.status}
                        onEdit={() => setDialog({ open: true, followUp: f })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <FollowUpFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        applicationId={dialog.followUp?.application_id ?? applications[0]?.id ?? ""}
        applications={applications}
        followUp={dialog.followUp}
      />
    </>
  );
}
