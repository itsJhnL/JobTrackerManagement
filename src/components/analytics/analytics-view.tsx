"use client";

import { BarChart3, Info } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  APPLICATION_STATUS_COLORS,
  APPLICATION_STATUS_COLORS_DARK,
  APPLICATION_STATUS_LABELS,
  CHART_SERIES,
} from "@/lib/constants";
import type { AnalyticsData, RateMetric } from "@/lib/data/analytics";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Charts follow the dataviz method: one axis per chart, a single series colour
 * for magnitude, status colours only where the status name is already a label,
 * thin marks with rounded ends, recessive grid, hover tooltips, and a table
 * fallback for every chart. Percentages are hidden below the minimum sample.
 */
export function AnalyticsView({ data }: { data: AnalyticsData }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const series = dark ? CHART_SERIES.dark : CHART_SERIES.light;
  const statusColors = dark ? APPLICATION_STATUS_COLORS_DARK : APPLICATION_STATUS_COLORS;

  if (data.total === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No data yet"
        description="Analytics appear once you have added a few applications."
      />
    );
  }

  const weekMax = Math.max(1, ...data.weeks.map((w) => w.count));

  return (
    <div className="flex flex-col gap-4">
      {/* Conversion tiles: the headline is a number, so a stat tile, not a chart. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <RateTile
          label="Response rate"
          metric={data.responseRate}
          min={data.minSample}
          hint="Reached Responded or later"
        />
        <RateTile
          label="Interview rate"
          metric={data.interviewRate}
          min={data.minSample}
          hint="Reached Interview or later"
        />
        <RateTile
          label="Offer rate"
          metric={data.offerRate}
          min={data.minSample}
          hint="Reached Offer or Hired"
        />
        <Card size="sm" className="gap-1">
          <div className="flex items-center justify-between px-3 text-xs text-muted-foreground">
            <span>Avg. days to response</span>
            <UiTooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <Info className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>
                From the day you marked Applied to the first response-type status. Shown
                once {data.minSample} applications have a response.
              </TooltipContent>
            </UiTooltip>
          </div>
          <div className="px-3">
            {data.avgDaysToResponse.value === null ? (
              <p className="font-heading text-lg font-semibold text-muted-foreground">
                Not enough data
              </p>
            ) : (
              <p className="font-heading text-2xl font-semibold tabular-nums">
                {data.avgDaysToResponse.value} days
              </p>
            )}
            <p className="text-xs text-muted-foreground tabular-nums">
              {data.avgDaysToResponse.count} with a response
            </p>
          </div>
        </Card>
        <RateTile
          label="Rejection rate"
          metric={data.rejectionRate}
          min={data.minSample}
          hint="Currently Rejected"
          tone="danger"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Applications submitted</CardTitle>
            <CardDescription>Per week, last {data.weeks.length} weeks.</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="h-56 w-full"
              role="img"
              aria-label={`Applications per week; peak of ${weekMax}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.weeks}
                  margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    width={40}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        formatter={(v) => `${v} application${v === 1 ? "" : "s"}`}
                      />
                    }
                    cursor={{ stroke: "var(--border)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={series}
                    strokeWidth={2}
                    dot={{ r: 3, fill: series, strokeWidth: 0 }}
                    activeDot={{ r: 5, stroke: "var(--background)", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <DataTable
              rows={data.weeks.map((w) => [w.label, w.count])}
              headers={["Week of", "Submitted"]}
            />
            <DataTable
              rows={data.months.map((mo) => [mo.label, mo.count])}
              headers={["Month", "Submitted"]}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Average hourly rate</CardTitle>
            <CardDescription>Equivalent hourly, per currency. Estimates.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RateList title="Proposed" items={data.avgProposedHourly} />
            <RateList title="Negotiated" items={data.avgNegotiatedHourly} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>By status</CardTitle>
            <CardDescription>Current stage of every application.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBars
              rows={data.byStatus
                .filter((s) => s.count > 0)
                .map((s) => ({
                  name: APPLICATION_STATUS_LABELS[s.status],
                  count: s.count,
                  color: statusColors[s.status],
                }))}
              fallbackColor={series}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By platform</CardTitle>
            <CardDescription>Where you find opportunities.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBars rows={data.byPlatform.slice(0, 8)} fallbackColor={series} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By employment type</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBars rows={data.byEmploymentType} fallbackColor={series} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RateTile({
  label,
  metric,
  min,
  hint,
  tone,
}: {
  label: string;
  metric: RateMetric;
  min: number;
  hint: string;
  tone?: "danger";
}) {
  const insufficient = metric.value === null;
  return (
    <Card size="sm" className="gap-1">
      <div className="flex items-center justify-between px-3 text-xs text-muted-foreground">
        <span>{label}</span>
        <UiTooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Info className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>
            {hint}. Shown once at least {min} applications were submitted.
          </TooltipContent>
        </UiTooltip>
      </div>
      <div className="px-3">
        {insufficient ? (
          <p className="font-heading text-lg font-semibold text-muted-foreground">
            Not enough data
          </p>
        ) : (
          <p
            className={cn(
              "font-heading text-2xl font-semibold tabular-nums",
              tone === "danger" &&
                metric.value! > 0.5 &&
                "text-rose-600 dark:text-rose-400",
            )}
          >
            {formatPercent(metric.value)}
          </p>
        )}
        <p className="text-xs text-muted-foreground tabular-nums">
          {metric.numerator} of {metric.denominator} submitted
        </p>
      </div>
    </Card>
  );
}

function RateList({
  title,
  items,
}: {
  title: string;
  items: { currency: string; value: number; count: number }[];
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rates recorded.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {items.map((i) => (
            <li
              key={i.currency}
              className="flex items-center justify-between px-3 py-1.5 text-sm"
            >
              <span className="text-muted-foreground">{i.currency}</span>
              <span className="tabular-nums">
                <span className="font-medium">{formatMoney(i.value, i.currency)}/hr</span>
                <span className="text-xs text-muted-foreground"> · n={i.count}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryBars({
  rows,
  fallbackColor,
}: {
  rows: { name: string; count: number; color?: string }[];
  fallbackColor: string;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing to show yet.</p>;
  const height = Math.max(120, rows.length * 28 + 16);
  return (
    <>
      <div
        style={{ height }}
        className="w-full"
        role="img"
        aria-label={rows.map((r) => `${r.name}: ${r.count}`).join(", ")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
            barCategoryGap={6}
          >
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <Tooltip
              content={
                <ChartTooltip
                  formatter={(v) => `${v} application${v === 1 ? "" : "s"}`}
                />
              }
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)" }}
            >
              {rows.map((r) => (
                <Cell key={r.name} fill={r.color ?? fallbackColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        rows={rows.map((r) => [r.name, r.count])}
        headers={["Category", "Count"]}
      />
    </>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { value?: number | string; payload?: { name?: string } }[];
  label?: string;
  formatter: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{label ?? payload[0]?.payload?.name}</p>
      <p className="text-muted-foreground tabular-nums">{formatter(v)}</p>
    </div>
  );
}

function DataTable({
  rows,
  headers,
}: {
  rows: (string | number)[][];
  headers: string[];
}) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
        View as table
      </summary>
      <Table className="mt-2 text-xs">
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead key={h} className="h-8">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((c, j) => (
                <TableCell key={j} className={cn("py-1", j > 0 && "tabular-nums")}>
                  {c}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </details>
  );
}
