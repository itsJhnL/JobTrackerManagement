import Link from "next/link";
import { BellRing } from "lucide-react";

import { FollowUpActions } from "@/components/follow-ups/follow-up-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FOLLOW_UP_TYPE_LABELS, PRIORITY_STYLES } from "@/lib/constants";
import type { FollowUpWithApplication } from "@/lib/data/follow-ups";
import { formatRelativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FollowUpsPanelProps {
  overdue: FollowUpWithApplication[];
  today: FollowUpWithApplication[];
  upcoming: FollowUpWithApplication[];
}

export function FollowUpsPanel({ overdue, today, upcoming }: FollowUpsPanelProps) {
  const total = overdue.length + today.length + upcoming.length;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Follow-ups</CardTitle>
        <CardDescription>
          {overdue.length > 0
            ? `${overdue.length} overdue · ${today.length} due today`
            : today.length > 0
              ? `${today.length} due today`
              : "Nothing overdue."}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" render={<Link href="/follow-ups" />}>
            View all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {total === 0 ? (
          <EmptyState
            size="sm"
            icon={BellRing}
            title="No follow-ups scheduled"
            description="Follow-ups are created automatically when you mark an application as applied."
          />
        ) : (
          <>
            <Group title="Overdue" items={overdue} tone="danger" />
            <Group title="Due today" items={today} tone="warning" />
            <Group title="Upcoming" items={upcoming} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Group({
  title,
  items,
  tone,
}: {
  title: string;
  items: FollowUpWithApplication[];
  tone?: "danger" | "warning";
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h3
        className={cn(
          "text-xs font-medium tracking-wide uppercase",
          tone === "danger"
            ? "text-rose-600 dark:text-rose-400"
            : tone === "warning"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
        )}
      >
        {title} <span className="tabular-nums">({items.length})</span>
      </h3>
      <ul className="flex flex-col divide-y rounded-lg border">
        {items.map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <Link
                href={
                  f.application
                    ? `/applications/${f.application.id}?tab=communication`
                    : "/follow-ups"
                }
                className="block truncate text-sm font-medium hover:underline"
              >
                {f.application?.company_name ?? "Application"}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {f.application?.job_title}
                </span>
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                <span className={PRIORITY_STYLES[f.priority]}>{f.priority}</span>
                {" · "}
                {FOLLOW_UP_TYPE_LABELS[f.follow_up_type]}
                {" · "}
                <span
                  className={
                    tone === "danger" ? "text-rose-600 dark:text-rose-400" : undefined
                  }
                >
                  {formatRelativeDay(f.due_date)}
                </span>
              </p>
            </div>
            <FollowUpActions id={f.id} status={f.status} compact />
          </li>
        ))}
      </ul>
    </div>
  );
}
