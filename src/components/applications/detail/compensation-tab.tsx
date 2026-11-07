import Link from "next/link";
import { Info, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { estimateCompensation, estimateForApplication } from "@/lib/compensation";
import {
  PAYMENT_FREQUENCY_LABELS,
  RATE_TYPE_LABELS,
  WORKING_DAY_LABELS,
  type PaymentFrequency,
  type WorkingDay,
} from "@/lib/constants";
import type { ApplicationRow } from "@/lib/supabase/database.types";
import { formatHours, formatMoney, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { KeyValueList, Prose, Section } from "./section";

export function CompensationTab({ application: a }: { application: ApplicationRow }) {
  const est = estimateForApplication(a);
  const rows = [
    { key: "proposed", label: "My proposed", value: a.proposed_rate },
    { key: "offered", label: "Employer offered", value: a.offered_rate },
    { key: "negotiated", label: "Final negotiated", value: a.negotiated_rate },
  ] as const;
  const minimum = a.minimum_rate;
  const belowMinimum =
    minimum !== null &&
    est.source !== null &&
    (a.negotiated_rate ?? a.offered_rate ?? a.proposed_rate ?? 0) < minimum;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Section
          title="Rates"
          description={`All amounts in ${a.currency}, ${RATE_TYPE_LABELS[a.rate_type].toLowerCase()}.`}
          action={
            <Button
              variant="ghost"
              size="sm"
              render={<Link href={`/applications/${a.id}/edit`} />}
            >
              <Pencil data-icon="inline-start" /> Edit
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {rows.map((r) => {
              const e = estimateCompensation({
                rate: r.value,
                rateType: a.rate_type,
                hoursPerWeek: a.hours_per_week,
                hoursPerDay: a.hours_per_day,
                workingDaysPerWeek: a.working_days.length || null,
              });
              const current = est.source === r.key;
              return (
                <div
                  key={r.key}
                  className={cn(
                    "rounded-lg border p-3",
                    current && "border-primary/40 bg-primary/5",
                  )}
                >
                  <p className="flex items-center justify-between text-xs text-muted-foreground">
                    {r.label}
                    {current ? (
                      <span className="rounded-sm bg-primary/10 px-1 text-[10px] font-medium text-primary uppercase">
                        current
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 font-heading text-xl font-semibold tabular-nums">
                    {r.value !== null ? (
                      formatRate(r.value, a.currency, a.rate_type)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </p>
                  {e.monthly !== null ? (
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      ≈ {formatMoney(e.monthly, a.currency, { maximumFractionDigits: 0 })}
                      /mo est.
                    </p>
                  ) : e.oneTime !== null ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">one-time</p>
                  ) : null}
                </div>
              );
            })}
          </div>
          {minimum !== null ? (
            <p
              className={cn(
                "mt-3 text-sm",
                belowMinimum
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground",
              )}
            >
              Minimum acceptable:{" "}
              <span className="font-medium tabular-nums">
                {formatRate(minimum, a.currency, a.rate_type)}
              </span>
              {belowMinimum ? " — the current rate is below your floor." : ""}
            </p>
          ) : null}
        </Section>

        <Section
          title="Estimated income"
          description="Based on the current rate and the hours recorded on this application. Edit the application to change assumptions."
        >
          {est.monthly !== null ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                label="Monthly"
                value={formatMoney(est.monthly, a.currency, { maximumFractionDigits: 0 })}
              />
              <Stat
                label="Annual"
                value={formatMoney(est.annual ?? 0, a.currency, {
                  maximumFractionDigits: 0,
                })}
              />
              <Stat
                label="Equivalent hourly"
                value={`${formatMoney(est.hourly ?? 0, a.currency)}/hr`}
              />
            </div>
          ) : est.oneTime !== null ? (
            <Stat
              label="Project total (one-time)"
              value={formatMoney(est.oneTime, a.currency, { maximumFractionDigits: 0 })}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Add a rate to see an estimate.
            </p>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5" />
            Assumes {est.assumptions.hoursPerWeek}h/week and{" "}
            {est.assumptions.workingDaysPerWeek} days/week
            {est.assumptions.usedDefaults
              ? " (defaults — set hours on the application for accuracy)"
              : ""}
            .
          </p>
        </Section>
      </div>

      <div className="flex flex-col gap-4">
        <Section title="Working hours">
          <KeyValueList
            columns={1}
            items={[
              {
                label: "Hours per week",
                value: a.hours_per_week ? formatHours(a.hours_per_week) : null,
              },
              {
                label: "Hours per day",
                value: a.hours_per_day ? formatHours(a.hours_per_day) : null,
              },
              {
                label: "Working days",
                value: a.working_days.length
                  ? a.working_days
                      .map((d) => WORKING_DAY_LABELS[d as WorkingDay] ?? d)
                      .join(", ")
                  : null,
              },
              { label: "Schedule", value: a.work_schedule },
              { label: "Shift", value: a.shift },
              { label: "Time zone", value: a.timezone },
              {
                label: "Payment frequency",
                value: a.payment_frequency
                  ? (PAYMENT_FREQUENCY_LABELS[a.payment_frequency as PaymentFrequency] ??
                    a.payment_frequency)
                  : null,
              },
            ]}
          />
        </Section>
        <Section title="Benefits">
          <Prose text={a.benefits} />
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <span className="rounded-sm bg-muted px-1 text-[10px] font-medium uppercase">
              est.
            </span>
          </TooltipTrigger>
          <TooltipContent>Estimate, not a guarantee.</TooltipContent>
        </Tooltip>
      </p>
      <p className="mt-1 font-heading text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
