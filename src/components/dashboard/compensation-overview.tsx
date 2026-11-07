import Link from "next/link";
import { CircleDollarSign, Info } from "lucide-react";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DashboardData } from "@/lib/data/dashboard";
import { formatHours, formatMoney } from "@/lib/format";

export function CompensationOverview({ data }: { data: DashboardData["pipeline"] }) {
  const maxBand = Math.max(1, ...data.bands.map((b) => b.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Pipeline potential
          <Tooltip>
            <TooltipTrigger
              render={<span className="inline-flex text-muted-foreground" />}
            >
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-56">
              Estimates use negotiated → offered → proposed rate and the hours on each
              application. Currencies are never combined.
            </TooltipContent>
          </Tooltip>
        </CardTitle>
        <CardDescription>
          What active applications (applied → offer) could pay if they landed. Estimates
          per currency; not income.
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/applications/compare" />}
          >
            Compare
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {data.withRate === 0 ? (
          <EmptyState
            size="sm"
            icon={CircleDollarSign}
            title="No rates recorded"
            description="Add an offered or proposed rate to an active application to see estimates."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Avg. hourly (equiv.)">
                {data.averageHourly.map((a) => (
                  <div key={a.currency} className="tabular-nums">
                    {formatMoney(a.value, a.currency)}
                    <span className="text-xs text-muted-foreground">
                      /hr {a.currency}
                    </span>
                  </div>
                ))}
              </Stat>
              <Stat label="Expected weekly hours">
                <div className="tabular-nums">{formatHours(data.totalWeeklyHours)}</div>
                <p className="text-xs text-muted-foreground">
                  If every active role landed
                </p>
              </Stat>
              <Stat label="Est. monthly income">
                {data.monthlyByCurrency.map((m) => (
                  <div key={m.currency} className="tabular-nums">
                    {formatMoney(m.monthly, m.currency, { maximumFractionDigits: 0 })}
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      {m.currency} · {m.count}
                    </span>
                  </div>
                ))}
              </Stat>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                By equivalent hourly rate
              </p>
              <ul className="flex flex-col gap-1.5">
                {data.bands.map((b) => (
                  <li key={b.label} className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {b.label}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-foreground/70"
                        style={{ width: `${(b.count / maxBand) * 100}%` }}
                      />
                    </span>
                    <span className="w-6 text-right text-xs tabular-nums">{b.count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Bands are in each application&apos;s own currency.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-col gap-0.5 font-heading text-lg font-semibold tracking-tight">
        {children}
      </div>
    </div>
  );
}
