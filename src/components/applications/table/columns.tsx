"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/constants";
import type { ApplicationListItem } from "@/lib/data/applications";
import {
  formatDate,
  formatHours,
  formatRate,
  formatRelativeDay,
  formatTimeAgo,
} from "@/lib/format";
import { daysFromDue } from "@/lib/follow-ups";
import { cn } from "@/lib/utils";

import { ApplicationRowActions } from "../row-actions";
import { StatusSelect } from "../status-select";
import type { ApplicationsTableFeatures } from "./features";

const helper = createColumnHelper<ApplicationsTableFeatures, ApplicationListItem>();

/** Equivalent-hourly accessor is not needed for filtering; we filter on the effective rate. */
function effectiveRate(row: ApplicationListItem) {
  return row.negotiated_rate ?? row.offered_rate ?? row.proposed_rate ?? null;
}

export const applicationColumns = helper.columns([
  helper.display({
    id: "select",
    enableSorting: false,
    enableHiding: false,
    enableGlobalFilter: false,
    meta: { className: "w-8 pr-0" },
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all on this page"
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={
          table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
      />
    ),
  }),
  helper.accessor("company_name", {
    header: "Company",
    sortFn: "alphanumeric",
    meta: { label: "Company", className: "min-w-44" },
    cell: ({ row, getValue }) => (
      <div className="flex min-w-0 flex-col">
        <Link
          href={`/applications/${row.original.id}`}
          className="truncate font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {getValue()}
        </Link>
        {row.original.location ? (
          <span className="truncate text-xs text-muted-foreground">
            {row.original.location}
          </span>
        ) : null}
      </div>
    ),
  }),
  helper.accessor("job_title", {
    header: "Job title",
    sortFn: "alphanumeric",
    meta: { label: "Job title", className: "min-w-48" },
    cell: ({ row, getValue }) => (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate">{getValue()}</span>
        {row.original.job_url ? (
          <a
            href={row.original.job_url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open job post"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
    ),
  }),
  helper.accessor("status", {
    header: "Status",
    filterFn: "arrHas",
    sortFn: "basic",
    enableGlobalFilter: false,
    meta: { label: "Status", className: "w-36" },
    cell: ({ row, getValue }) => (
      <StatusSelect id={row.original.id} status={getValue()} />
    ),
  }),
  helper.accessor("platform", {
    header: "Platform",
    filterFn: "arrHas",
    sortFn: "alphanumeric",
    sortUndefined: "last",
    meta: { label: "Platform", className: "w-32" },
    cell: ({ getValue }) => (
      <span className="truncate text-muted-foreground">{getValue() ?? "—"}</span>
    ),
  }),
  helper.accessor("employment_type", {
    header: "Type",
    filterFn: "arrHas",
    sortFn: "alphanumeric",
    sortUndefined: "last",
    enableGlobalFilter: false,
    meta: { label: "Employment type", className: "w-28" },
    cell: ({ getValue }) => {
      const v = getValue();
      return (
        <span className="text-muted-foreground">
          {v ? EMPLOYMENT_TYPE_LABELS[v] : "—"}
        </span>
      );
    },
  }),
  helper.accessor("offered_rate", {
    header: "Offered",
    sortFn: "basic",
    sortUndefined: "last",
    enableGlobalFilter: false,
    meta: { label: "Offered rate", align: "end", className: "w-28" },
    cell: ({ row, getValue }) => (
      <span className="tabular-nums">
        {formatRate(getValue(), row.original.currency, row.original.rate_type)}
      </span>
    ),
  }),
  helper.accessor("proposed_rate", {
    header: "Proposed",
    sortFn: "basic",
    sortUndefined: "last",
    enableGlobalFilter: false,
    meta: { label: "Proposed rate", align: "end", className: "w-28" },
    cell: ({ row, getValue }) => (
      <span className="tabular-nums">
        {formatRate(getValue(), row.original.currency, row.original.rate_type)}
      </span>
    ),
  }),
  helper.accessor((row) => effectiveRate(row), {
    id: "effective_rate",
    header: "Rate",
    filterFn: "inNumberRange",
    sortFn: "basic",
    sortUndefined: "last",
    enableGlobalFilter: false,
    meta: { label: "Effective rate", align: "end", className: "w-28" },
    cell: ({ row, getValue }) => (
      <span className="font-medium tabular-nums">
        {formatRate(getValue(), row.original.currency, row.original.rate_type)}
      </span>
    ),
  }),
  helper.accessor("hours_per_week", {
    header: "Hrs/wk",
    sortFn: "basic",
    sortUndefined: "last",
    enableGlobalFilter: false,
    meta: { label: "Hours per week", align: "end", className: "w-20" },
    cell: ({ getValue }) => (
      <span className="text-muted-foreground tabular-nums">
        {formatHours(getValue())}
      </span>
    ),
  }),
  helper.accessor("applied_at", {
    header: "Applied",
    sortFn: "datetime",
    sortUndefined: "last",
    enableGlobalFilter: false,
    meta: { label: "Applied date", className: "w-28" },
    cell: ({ getValue }) => (
      <span className="text-muted-foreground tabular-nums">{formatDate(getValue())}</span>
    ),
  }),
  helper.accessor("next_follow_up", {
    header: "Next follow-up",
    sortFn: "datetime",
    sortUndefined: "last",
    enableGlobalFilter: false,
    meta: { label: "Next follow-up", className: "w-32" },
    cell: ({ getValue }) => {
      const v = getValue();
      if (!v) return <span className="text-muted-foreground">—</span>;
      const overdue = daysFromDue(v) > 0;
      const today = daysFromDue(v) === 0;
      return (
        <span
          className={cn(
            "tabular-nums",
            overdue
              ? "font-medium text-rose-600 dark:text-rose-400"
              : today
                ? "font-medium text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
          )}
        >
          {formatRelativeDay(v)}
        </span>
      );
    },
  }),
  helper.accessor("updated_at", {
    header: "Updated",
    sortFn: "datetime",
    enableGlobalFilter: false,
    meta: { label: "Last updated", className: "w-28" },
    cell: ({ getValue }) => (
      <span className="text-muted-foreground tabular-nums">
        {formatTimeAgo(getValue())}
      </span>
    ),
  }),
  helper.display({
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    enableGlobalFilter: false,
    meta: { className: "w-10 pl-0" },
    cell: ({ row }) => (
      <ApplicationRowActions
        id={row.original.id}
        companyName={row.original.company_name}
        jobUrl={row.original.job_url}
        archived={!!row.original.archived_at}
      />
    ),
  }),
]);

/** Columns hidden by default in the table view. */
export const defaultColumnVisibility = {
  offered_rate: false,
  proposed_rate: false,
  hours_per_week: false,
  updated_at: false,
};
