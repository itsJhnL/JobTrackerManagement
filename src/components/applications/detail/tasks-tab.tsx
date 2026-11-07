"use client";

import { useState } from "react";
import { ClipboardList, ExternalLink, Plus } from "lucide-react";

import { deleteAssessment } from "@/actions/assessments";
import { AssessmentFormDialog } from "@/components/assessments/assessment-form";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormat } from "@/components/timezone-provider";
import { EntityMenu } from "@/components/shared/entity-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ASSESSMENT_STATUS_LABELS, type AssessmentStatus } from "@/lib/constants";
import type { AssessmentRow } from "@/lib/supabase/database.types";
import { formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Section } from "./section";

export const ASSESSMENT_STATUS_STYLES: Record<AssessmentStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  submitted: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  passed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  expired: "bg-muted text-muted-foreground line-through",
};

interface TasksTabProps {
  applicationId: string;
  assessments: AssessmentRow[];
}

export function TasksTab({ applicationId, assessments }: TasksTabProps) {
  const [dialog, setDialog] = useState<{ open: boolean; assessment?: AssessmentRow }>({
    open: false,
  });

  return (
    <>
      <Section
        title="Assessments & tasks"
        description="Technical assignments, tests and deadlines for this application."
        action={
          <Button size="sm" variant="outline" onClick={() => setDialog({ open: true })}>
            <Plus data-icon="inline-start" /> Add
          </Button>
        }
      >
        {assessments.length === 0 ? (
          <EmptyState
            size="sm"
            icon={ClipboardList}
            title="No assessments"
            description="Track take-home tasks and tests with their deadlines."
          />
        ) : (
          <AssessmentList
            items={assessments}
            onEdit={(a) => setDialog({ open: true, assessment: a })}
          />
        )}
      </Section>
      <AssessmentFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        applicationId={applicationId}
        assessment={dialog.assessment}
      />
    </>
  );
}

export function AssessmentList({
  items,
  onEdit,
}: {
  items: AssessmentRow[];
  onEdit: (a: AssessmentRow) => void;
}) {
  const fmt = useFormat();
  const [now] = useState(() => Date.now());
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {items.map((a) => {
        const openStatus = a.status === "not_started" || a.status === "in_progress";
        const overdue =
          openStatus && a.deadline ? new Date(a.deadline).getTime() < now : false;
        return (
          <li key={a.id} className="flex items-start gap-3 px-3 py-3">
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{a.title}</p>
                <Badge
                  variant="outline"
                  className={cn("border-transparent", ASSESSMENT_STATUS_STYLES[a.status])}
                >
                  {ASSESSMENT_STATUS_LABELS[a.status]}
                </Badge>
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
                <p className="mt-1 line-clamp-3 text-xs whitespace-pre-wrap text-muted-foreground">
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
            />
          </li>
        );
      })}
    </ul>
  );
}
