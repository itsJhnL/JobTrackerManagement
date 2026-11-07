import Link from "next/link";
import {
  BellRing,
  Briefcase,
  CalendarClock,
  CircleDollarSign,
  Flame,
  Trophy,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatCompact } from "@/lib/format";
import type { DashboardData } from "@/lib/data/dashboard";
import { cn } from "@/lib/utils";

interface StatCardsProps {
  data: DashboardData;
}

export function StatCards({ data }: StatCardsProps) {
  const due = data.followUps.overdue.length + data.followUps.today.length;
  const income = data.income;
  const activeJobs = income.jobs.length;

  const cards = [
    {
      label: "Total applications",
      value: data.counts.total,
      icon: Briefcase,
      href: "/applications",
      hint:
        data.counts.byStatus.saved > 0
          ? `${data.counts.byStatus.saved} saved, not yet applied`
          : undefined,
    },
    {
      label: "Active",
      value: data.counts.active,
      icon: Flame,
      href: "/applications?status=active",
      hint: "Applied through offer",
    },
    {
      label: "Interviews",
      value: data.interviewsScheduled,
      icon: CalendarClock,
      href: "/interviews",
      hint: "Upcoming and pending",
    },
    {
      label: "Follow-ups due",
      value: due,
      icon: BellRing,
      href: "/follow-ups",
      hint:
        data.followUps.overdue.length > 0
          ? `${data.followUps.overdue.length} overdue`
          : "Nothing overdue",
      tone: data.followUps.overdue.length > 0 ? "danger" : undefined,
    },
    {
      label: "Offers",
      value: data.offers,
      icon: Trophy,
      href: "/applications?status=offer",
      hint:
        data.counts.byStatus.hired > 0
          ? `${data.counts.byStatus.hired} hired`
          : undefined,
      tone: data.offers > 0 ? "success" : undefined,
    },
    {
      label: "Est. monthly income",
      value:
        activeJobs > 0 && income.totalMonthly > 0
          ? formatCompact(income.totalMonthly, income.displayCurrency)
          : "—",
      icon: CircleDollarSign,
      href: "/dashboard#income",
      hint:
        activeJobs > 0
          ? `${income.displayCurrency} · ${activeJobs} active job${activeJobs === 1 ? "" : "s"}${income.unconverted.length ? ` · ${income.unconverted.length} unconverted` : ""}`
          : "From hired, active employment",
      estimate: true,
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card
            size="sm"
            className="group relative h-full gap-2 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center justify-between px-3 text-muted-foreground">
              <span className="text-xs font-medium">{c.label}</span>
              <c.icon className="size-3.5" />
            </div>
            <div className="px-3">
              <div
                className={cn(
                  "font-heading text-2xl font-semibold tracking-tight tabular-nums",
                  "tone" in c &&
                    c.tone === "danger" &&
                    "text-rose-600 dark:text-rose-400",
                  "tone" in c &&
                    c.tone === "success" &&
                    "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {c.value}
                {"estimate" in c && c.estimate && c.value !== "—" ? (
                  <span className="ml-1 align-middle text-[10px] font-medium text-muted-foreground uppercase">
                    est.
                  </span>
                ) : null}
              </div>
              {c.hint ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.hint}</p>
              ) : null}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
