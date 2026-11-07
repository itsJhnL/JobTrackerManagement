"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Briefcase, Info, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { ButtonLink } from "@/components/shared/button-link";
import { refreshRatesNow } from "@/actions/exchange-rates";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormat } from "@/components/timezone-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RATE_TYPE_LABELS } from "@/lib/constants";
import type { DashboardData } from "@/lib/data/dashboard";
import { formatHours, formatMoney, formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface IncomeOverviewProps {
  income: DashboardData["income"];
  rates: DashboardData["rates"];
}

const SOURCE_LABELS: Record<string, string> = {
  frankfurter: "European Central Bank (frankfurter.app)",
  "exchangerate-api": "ExchangeRate-API (open.er-api.com)",
};

export function IncomeOverview({ income, rates }: IncomeOverviewProps) {
  const router = useRouter();
  const fmt = useFormat();
  const [pending, start] = useTransition();
  const cur = income.displayCurrency;
  const hasJobs = income.jobs.length > 0;
  const needsRates = income.jobs.some((j) => j.currency !== cur && j.monthly !== null);

  const refresh = () =>
    start(async () => {
      const r = await refreshRatesNow();
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(`Rates updated · ${r.data.sources.join(", ")}`);
        r.data.warnings.forEach((w) => toast.warning(w));
        router.refresh();
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Estimated monthly income
          <Tooltip>
            <TooltipTrigger
              render={<span className="inline-flex text-muted-foreground" />}
            >
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              Only applications marked Hired with an active employment record count. Each
              job is calculated in its own currency (rate × hours/week × 4.33) and
              converted separately. Projected, not guaranteed earnings.
            </TooltipContent>
          </Tooltip>
        </CardTitle>
        <CardDescription>
          Active employment, consolidated in {cur}. Estimates, not guaranteed earnings.
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={pending}
            aria-label="Refresh exchange rates"
          >
            <RefreshCw className={cn(pending && "animate-spin")} />
            <span className="hidden sm:inline">
              {pending ? "Refreshing…" : "Refresh rates"}
            </span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!hasJobs ? (
          <EmptyState
            size="sm"
            icon={Briefcase}
            title="No active employment yet"
            description="When an application is marked Hired it becomes an employment record and its income shows up here."
            action={
              <ButtonLink href="/applications?status=offer" variant="outline" size="sm">
                View offers
              </ButtonLink>
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Headline
                label="Monthly"
                value={formatMoney(income.totalMonthly, cur, {
                  maximumFractionDigits: 2,
                })}
                big
              />
              <Headline
                label="Weekly"
                value={formatMoney(income.totalWeekly, cur, { maximumFractionDigits: 2 })}
              />
              <Headline label="Hours per week" value={formatHours(income.totalHours)} />
            </div>

            {income.byCurrency.length ? (
              <p className="text-xs text-muted-foreground">
                Original currency:{" "}
                {income.byCurrency.map((c, i) => (
                  <span key={c.currency} className="tabular-nums">
                    {i > 0 ? " · " : ""}
                    {formatMoney(c.monthly, c.currency, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    {c.currency}/mo
                  </span>
                ))}
              </p>
            ) : null}

            <ul className="flex flex-col divide-y rounded-lg border">
              {income.jobs.map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/applications/${j.id}?tab=compensation`}
                      className="truncate font-medium hover:underline"
                    >
                      {j.company_name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {j.job_title}
                      {j.rate !== null
                        ? ` · ${formatRate(j.rate, j.currency, j.rateType)} ${j.rateSource ?? ""}`
                        : " · no rate recorded"}
                      {j.monthly !== null
                        ? ` · ${formatHours(j.hoursPerWeek)}/wk${j.usedDefaults ? " (assumed)" : ""}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    {j.converted ? (
                      <>
                        <p className="font-medium">
                          {formatMoney(j.converted.monthly, cur, {
                            maximumFractionDigits: 2,
                          })}
                        </p>
                        {j.currency !== cur ? (
                          <p className="text-xs text-muted-foreground">
                            {formatMoney(j.monthly, j.currency, {
                              maximumFractionDigits: 2,
                            })}{" "}
                            · 1 {j.currency} ={" "}
                            {formatMoney(j.converted.rate, cur, {
                              maximumFractionDigits: 4,
                            })}
                          </p>
                        ) : null}
                      </>
                    ) : j.monthly !== null ? (
                      <Badge
                        variant="outline"
                        className="text-amber-700 dark:text-amber-300"
                      >
                        <TriangleAlert /> No {j.currency}→{cur} rate
                      </Badge>
                    ) : j.oneTime !== null ? (
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(j.oneTime, j.currency)} one-time (
                        {RATE_TYPE_LABELS[j.rateType]})
                      </p>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Add a rate
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex flex-col gap-1 border-t pt-3 text-xs text-muted-foreground">
          {rates.usdToDisplay !== null && cur !== "USD" ? (
            <p className="tabular-nums">
              Current exchange rate: 1 USD ={" "}
              {formatMoney(rates.usdToDisplay, cur, { maximumFractionDigits: 4 })}
            </p>
          ) : null}
          <p
            className={cn(
              rates.snapshot.freshness === "stale" &&
                "text-amber-700 dark:text-amber-300",
              rates.snapshot.freshness === "unavailable" &&
                needsRates &&
                "text-rose-600 dark:text-rose-400",
            )}
          >
            {rates.snapshot.freshness === "unavailable"
              ? "Exchange rate temporarily unavailable"
              : rates.snapshot.label}
            {rates.snapshot.lastFetchedAt
              ? ` · last updated ${fmt.dateTime(rates.snapshot.lastFetchedAt)}`
              : ""}
          </p>
          {rates.snapshot.sources.length ? (
            <p>
              Source:{" "}
              {rates.snapshot.sources.map((s) => SOURCE_LABELS[s] ?? s).join(" + ")}.
              Rates are daily reference rates, not live market quotes.
            </p>
          ) : null}
          {rates.error ? (
            <p className="text-rose-600 dark:text-rose-400">
              Provider error: {rates.error}. The last valid rates are shown.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Headline({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        big && "border-primary/20 bg-primary/5",
      )}
    >
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        <span className="rounded-sm bg-muted px-1 text-[10px] font-medium uppercase">
          est.
        </span>
      </p>
      <p
        className={cn(
          "mt-1 font-heading font-semibold tracking-tight tabular-nums",
          big ? "text-2xl" : "text-lg",
        )}
      >
        {value}
      </p>
    </div>
  );
}
