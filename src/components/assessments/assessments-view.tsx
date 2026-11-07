"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardList, ExternalLink, Plus } from "lucide-react";

import { deleteAssessment } from "@/actions/assessments";
import { ASSESSMENT_STATUS_STYLES } from "@/components/applications/detail/tasks-tab";
import { StatusBadge } from "@/components/applications/status-badge";
import type { ApplicationOption } from "@/components/interviews/interview-form";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormat } from "@/components/timezone-provider";
import { EntityMenu } from "@/components/shared/entity-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ASSESSMENT_STATUS_LABELS } from "@/lib/constants";
import type { AssessmentWithApplication } from "@/lib/data/assessments";
import { formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

import { AssessmentFormDialog } from "./assessment-form";

interface AssessmentsViewProps {
  assessments: AssessmentWithApplication[];
  applications: ApplicationOption[];
  now: number;
}

export function AssessmentsView({
  assessments,
  applications,
  now,
}: AssessmentsViewProps) {
  const [dialog, setDialog] = useState<{
    open: boolean;
    assessment?: AssessmentWithApplication;
  }>({ open: false });
  const open = assessments.filter(
    (a) => a.status === "not_started" || a.status === "in_progress",
  );
  const done = assessments.filter((a) => !open.includes(a));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {assessments.length === 0
            ? "No assessments recorded."
            : `${open.length} open · ${done.length} completed`}
        </p>
        <Button
          size="sm"
          onClick={() => setDialog({ open: true })}
          disabled={applications.length === 0}
        >
          <Plus data-icon="inline-start" /> Add assessment
        </Button>
      </div>

      {assessments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assessments yet"
          description="Track take-home tasks, tests and technical assignments with their deadlines."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <Group
            title="Open"
            items={open}
            now={now}
            onEdit={(a) => setDialog({ open: true, assessment: a })}
            emptyText="Nothing pending."
          />
          <Group
            title="Completed"
            items={done}
            now={now}
            muted
            onEdit={(a) => setDialog({ open: true, assessment: a })}
            emptyText="Nothing completed yet."
          />
        </div>
      )}

      <AssessmentFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        applicationId={dialog.assessment?.application_id ?? applications[0]?.id}
        applications={applications}
        assessment={dialog.assessment}
      />
    </>
  );
}

function Group({
  title,
  items,
  now,
  muted,
  onEdit,
  emptyText,
}: {
  title: string;
  items: AssessmentWithApplication[];
  now: number;
  muted?: boolean;
  onEdit: (a: AssessmentWithApplication) => void;
  emptyText: string;
}) {
  const fmt = useFormat();
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
          {items.map((a) => {
            const overdue =
              !muted && a.deadline ? new Date(a.deadline).getTime() < now : false;
            return (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.application ? (
                      <Link
                        href={`/applications/${a.application.id}?tab=tasks`}
                        className="font-medium hover:underline"
                      >
                        {a.application.company_name}
                      </Link>
                    ) : null}
                    <span>{a.title}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "border-transparent",
                        ASSESSMENT_STATUS_STYLES[a.status],
                      )}
                    >
                      {ASSESSMENT_STATUS_LABELS[a.status]}
                    </Badge>
                    {a.application ? <StatusBadge status={a.application.status} /> : null}
                  </div>
                  <p
                    className={cn(
                      "text-xs tabular-nums",
                      overdue
                        ? "font-medium text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {a.deadline
                      ? `Due ${fmt.dateTime(a.deadline)} · ${formatTimeAgo(a.deadline)}`
                      : "No deadline"}
                  </p>
                  {a.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {a.description}
                    </p>
                  ) : null}
                  {a.submission_url ? (
                    <a
                      href={a.submission_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                    >
                      <ExternalLink className="size-3" /> Submission
                    </a>
                  ) : null}
                </div>
                <EntityMenu
                  onEdit={() => onEdit(a)}
                  onDelete={() => deleteAssessment(a.id)}
                  deleteTitle={`Delete "${a.title}"?`}
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
