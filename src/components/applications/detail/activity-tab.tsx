import { ArrowRight, History } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { APPLICATION_STATUS_LABELS } from "@/lib/constants";
import type {
  ActivityRow,
  ApplicationStatusHistoryRow,
} from "@/lib/supabase/database.types";
import { formatDateTime, formatTimeAgo } from "@/lib/format";

import { StatusBadge } from "../status-badge";
import { Section } from "./section";

interface ActivityTabProps {
  statusHistory: ApplicationStatusHistoryRow[];
  activities: ActivityRow[];
}

export function ActivityTab({ statusHistory, activities }: ActivityTabProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section
        title="Status history"
        description="Recorded automatically on every change."
      >
        {statusHistory.length === 0 ? (
          <EmptyState size="sm" icon={History} title="No status changes yet" />
        ) : (
          <ol className="relative ml-2 flex flex-col gap-4 border-l pl-5">
            {statusHistory.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute top-1.5 -left-[25px] size-2 rounded-full border-2 border-background bg-foreground/60" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {h.previous_status ? (
                    <>
                      <span className="text-muted-foreground">
                        {APPLICATION_STATUS_LABELS[h.previous_status]}
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                    </>
                  ) : (
                    <span className="text-muted-foreground">Created as</span>
                  )}
                  <StatusBadge status={h.new_status} />
                </div>
                {h.note ? (
                  <p className="mt-1 text-sm text-muted-foreground">{h.note}</p>
                ) : null}
                <p
                  className="mt-0.5 text-xs text-muted-foreground tabular-nums"
                  title={formatDateTime(h.changed_at)}
                >
                  {formatTimeAgo(h.changed_at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>
      <Section
        title="Activity"
        description="Everything that happened on this application."
      >
        {activities.length === 0 ? (
          <EmptyState size="sm" icon={History} title="No activity yet" />
        ) : (
          <ol className="flex flex-col divide-y">
            {activities.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 py-2 text-sm"
              >
                <span>{a.title}</span>
                <span
                  className="shrink-0 text-xs text-muted-foreground tabular-nums"
                  title={formatDateTime(a.created_at)}
                >
                  {formatTimeAgo(a.created_at)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
