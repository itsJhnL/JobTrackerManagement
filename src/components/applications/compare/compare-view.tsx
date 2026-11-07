"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Scale, X } from "lucide-react";

import { StatusBadge } from "@/components/applications/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { estimateCompensation, estimateForApplication } from "@/lib/compensation";
import {
  EMPLOYMENT_TYPE_LABELS,
  RATE_TYPE_LABELS,
  WORKING_DAY_LABELS,
  type WorkingDay,
} from "@/lib/constants";
import type { ApplicationListItem } from "@/lib/data/applications";
import { formatDate, formatHours, formatMoney, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX = 4;

interface CompareViewProps {
  applications: ApplicationListItem[];
  preselected: string[];
}

export function CompareView({ applications, preselected }: CompareViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const byId = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications]);
  const [ids, setIds] = useState<string[]>(() => {
    const valid = preselected.filter((id) => byId.has(id)).slice(0, MAX);
    if (valid.length) return valid;
    // Sensible default: the most recently updated applications that have a rate.
    return applications
      .filter((a) => a.negotiated_rate ?? a.offered_rate ?? a.proposed_rate)
      .slice(0, 3)
      .map((a) => a.id);
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = ids
    .map((id) => byId.get(id))
    .filter((a): a is ApplicationListItem => !!a);

  function update(next: string[]) {
    setIds(next);
    router.replace(next.length ? `${pathname}?ids=${next.join(",")}` : pathname, {
      scroll: false,
    });
  }

  const currencies = new Set(selected.map((a) => a.currency));
  const estimates = selected.map((a) => estimateForApplication(a));
  const bestHourlyByCurrency = new Map<string, number>();
  estimates.forEach((e, i) => {
    if (e.hourly === null) return;
    const c = selected[i].currency;
    bestHourlyByCurrency.set(c, Math.max(bestHourlyByCurrency.get(c) ?? 0, e.hourly));
  });

  const rows: {
    label: string;
    render: (a: ApplicationListItem, i: number) => React.ReactNode;
    muted?: boolean;
  }[] = [
    { label: "Status", render: (a) => <StatusBadge status={a.status} /> },
    {
      label: "Employment",
      render: (a) =>
        a.employment_type ? EMPLOYMENT_TYPE_LABELS[a.employment_type] : "—",
      muted: true,
    },
    { label: "Platform", render: (a) => a.platform ?? "—", muted: true },
    {
      label: "Rate type",
      render: (a) => `${RATE_TYPE_LABELS[a.rate_type]} · ${a.currency}`,
      muted: true,
    },
    { label: "Proposed", render: (a) => <Money value={a.proposed_rate} a={a} /> },
    { label: "Offered", render: (a) => <Money value={a.offered_rate} a={a} /> },
    { label: "Negotiated", render: (a) => <Money value={a.negotiated_rate} a={a} /> },
    {
      label: "Minimum acceptable",
      render: (a) => <Money value={a.minimum_rate} a={a} />,
      muted: true,
    },
    {
      label: "Equivalent hourly (est.)",
      render: (a, i) => {
        const e = estimates[i];
        if (e.hourly === null) return "—";
        const best =
          bestHourlyByCurrency.get(a.currency) === e.hourly &&
          currencies.size >= 1 &&
          selected.filter((s) => s.currency === a.currency).length > 1;
        return (
          <span
            className={cn(
              "tabular-nums",
              best && "font-semibold text-emerald-600 dark:text-emerald-400",
            )}
          >
            {formatMoney(e.hourly, a.currency)}/hr
          </span>
        );
      },
    },
    {
      label: "Monthly income (est.)",
      render: (a, i) => {
        const e = estimates[i];
        if (e.monthly !== null)
          return (
            <span className="font-medium tabular-nums">
              {formatMoney(e.monthly, a.currency, { maximumFractionDigits: 0 })}
            </span>
          );
        if (e.oneTime !== null)
          return (
            <span className="tabular-nums">
              {formatMoney(e.oneTime, a.currency, { maximumFractionDigits: 0 })} one-time
            </span>
          );
        return "—";
      },
    },
    {
      label: "Annual (est.)",
      render: (a, i) =>
        estimates[i].annual !== null ? (
          <span className="tabular-nums">
            {formatMoney(estimates[i].annual ?? 0, a.currency, {
              maximumFractionDigits: 0,
            })}
          </span>
        ) : (
          "—"
        ),
      muted: true,
    },
    {
      label: "Hours / week",
      render: (a, i) => (
        <span className="tabular-nums">
          {formatHours(estimates[i].assumptions.hoursPerWeek)}
          {estimates[i].assumptions.usedDefaults ? (
            <span className="text-muted-foreground"> (assumed)</span>
          ) : null}
        </span>
      ),
    },
    { label: "Hours / day", render: (a) => formatHours(a.hours_per_day), muted: true },
    {
      label: "Working days",
      render: (a) =>
        a.working_days.length
          ? a.working_days.map((d) => WORKING_DAY_LABELS[d as WorkingDay] ?? d).join(" ")
          : "—",
      muted: true,
    },
    { label: "Schedule", render: (a) => a.work_schedule ?? "—", muted: true },
    { label: "Time zone", render: (a) => a.timezone ?? "—", muted: true },
    { label: "Shift", render: (a) => a.shift ?? "—", muted: true },
    {
      label: "Benefits",
      render: (a) => <span className="line-clamp-3 text-xs">{a.benefits ?? "—"}</span>,
      muted: true,
    },
    { label: "Applied", render: (a) => formatDate(a.applied_at), muted: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8" />}>
            <Scale className="size-3.5" />
            {selected.length
              ? `${selected.length} of ${MAX} selected`
              : "Choose applications"}
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search applications…" />
              <CommandList>
                <CommandEmpty>No applications.</CommandEmpty>
                <CommandGroup>
                  {applications.map((a) => {
                    const active = ids.includes(a.id);
                    const disabled = !active && ids.length >= MAX;
                    return (
                      <CommandItem
                        key={a.id}
                        value={`${a.company_name} ${a.job_title}`}
                        disabled={disabled}
                        onSelect={() =>
                          update(active ? ids.filter((x) => x !== a.id) : [...ids, a.id])
                        }
                      >
                        <span
                          className={cn(
                            "flex size-4 items-center justify-center rounded-[4px] border border-input",
                            active && "border-primary bg-primary text-primary-foreground",
                          )}
                        >
                          {active ? <Check className="size-3" /> : null}
                        </span>
                        <span className="flex-1 truncate">
                          {a.company_name}{" "}
                          <span className="text-muted-foreground">· {a.job_title}</span>
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatRate(
                            a.negotiated_rate ?? a.offered_rate ?? a.proposed_rate,
                            a.currency,
                            a.rate_type,
                          )}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selected.map((a) => (
          <Button
            key={a.id}
            variant="secondary"
            size="sm"
            className="h-8"
            onClick={() => update(ids.filter((x) => x !== a.id))}
          >
            {a.company_name}
            <X className="size-3" />
          </Button>
        ))}
        {currencies.size > 1 ? (
          <p className="w-full text-xs text-amber-600 dark:text-amber-400">
            These applications use different currencies ({[...currencies].join(", ")}).
            Amounts are shown as recorded and are not converted.
          </p>
        ) : null}
      </div>

      {selected.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="Pick up to four applications"
          description="Choose applications above to compare pay, hours and schedule side by side."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="scrollbar-thin overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-44 min-w-40 text-xs">Criteria</TableHead>
                  {selected.map((a) => (
                    <TableHead key={a.id} className="min-w-44 align-top">
                      <Link
                        href={`/applications/${a.id}`}
                        className="block py-1 font-medium text-foreground hover:underline"
                      >
                        {a.company_name}
                      </Link>
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {a.job_title}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell className="text-xs font-medium text-muted-foreground">
                      {r.label}
                    </TableCell>
                    {selected.map((a, i) => (
                      <TableCell
                        key={a.id}
                        className={cn("align-top", r.muted && "text-muted-foreground")}
                      >
                        {r.render(a, i)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            Monthly estimates: hourly × hours/week × 52 ÷ 12 · daily × days/week × 52 ÷ 12
            · weekly × 52 ÷ 12 · annual ÷ 12. Project amounts are shown once, not monthly.
          </p>
        </div>
      )}
    </div>
  );
}

function Money({ value, a }: { value: number | null; a: ApplicationListItem }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const e = estimateCompensation({
    rate: value,
    rateType: a.rate_type,
    hoursPerWeek: a.hours_per_week,
    hoursPerDay: a.hours_per_day,
    workingDaysPerWeek: a.working_days.length || null,
  });
  return (
    <span className="tabular-nums">
      {formatRate(value, a.currency, a.rate_type)}
      {e.monthly !== null ? (
        <span className="block text-[11px] text-muted-foreground">
          ≈ {formatMoney(e.monthly, a.currency, { maximumFractionDigits: 0 })}/mo
        </span>
      ) : null}
    </span>
  );
}
