"use client";

import Link from "next/link";
import { CalendarDays, Clock, ExternalLink, MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/constants";
import type { ApplicationListItem } from "@/lib/data/applications";
import { formatDate, formatHours, formatRate, formatRelativeDay } from "@/lib/format";
import { daysFromDue } from "@/lib/follow-ups";
import { cn } from "@/lib/utils";

import { ApplicationRowActions } from "./row-actions";
import { StatusSelect } from "./status-select";

interface ApplicationCardProps {
  application: ApplicationListItem;
  selected?: boolean;
  onSelectedChange?: (v: boolean) => void;
}

export function ApplicationCard({
  application: a,
  selected,
  onSelectedChange,
}: ApplicationCardProps) {
  const rate = a.negotiated_rate ?? a.offered_rate ?? a.proposed_rate;
  const rateLabel = a.negotiated_rate
    ? "negotiated"
    : a.offered_rate
      ? "offered"
      : a.proposed_rate
        ? "proposed"
        : null;
  const overdue = a.next_follow_up ? daysFromDue(a.next_follow_up) > 0 : false;

  return (
    <Card
      size="sm"
      className={cn(
        "gap-3 transition-colors hover:bg-muted/30",
        selected && "ring-primary/40",
      )}
    >
      <div className="flex items-start gap-2 px-3">
        {onSelectedChange ? (
          <Checkbox
            aria-label="Select"
            checked={!!selected}
            onCheckedChange={(v) => onSelectedChange(!!v)}
            className="mt-1"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <Link
            href={`/applications/${a.id}`}
            className="block truncate font-medium hover:underline"
          >
            {a.company_name}
          </Link>
          <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
            <span className="truncate">{a.job_title}</span>
            {a.job_url ? (
              <a
                href={a.job_url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open job post"
                className="shrink-0 hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </p>
        </div>
        <ApplicationRowActions
          id={a.id}
          companyName={a.company_name}
          jobUrl={a.job_url}
          archived={!!a.archived_at}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 text-xs text-muted-foreground">
        <StatusSelect id={a.id} status={a.status} />
        {a.platform ? <span>{a.platform}</span> : null}
        {a.employment_type ? (
          <span>{EMPLOYMENT_TYPE_LABELS[a.employment_type]}</span>
        ) : null}
        {a.location ? (
          <span className="flex items-center gap-1">
            <MapPin className="size-3" />
            {a.location}
          </span>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3 border-t px-3 pt-3">
        <div>
          <p className="font-heading text-base font-semibold tabular-nums">
            {rate ? (
              formatRate(rate, a.currency, a.rate_type)
            ) : (
              <span className="text-muted-foreground">No rate</span>
            )}
          </p>
          {rateLabel ? (
            <p className="text-[11px] text-muted-foreground">
              {rateLabel}
              {a.hours_per_week ? ` · ${formatHours(a.hours_per_week)}/wk` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
          {a.applied_at ? (
            <span className="flex items-center gap-1 tabular-nums">
              <CalendarDays className="size-3" /> {formatDate(a.applied_at)}
            </span>
          ) : null}
          {a.next_follow_up ? (
            <span
              className={cn(
                "flex items-center gap-1 tabular-nums",
                overdue && "font-medium text-rose-600 dark:text-rose-400",
              )}
            >
              <Clock className="size-3" /> {formatRelativeDay(a.next_follow_up)}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
