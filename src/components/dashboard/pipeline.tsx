import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_COLORS,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/constants";

interface PipelineProps {
  byStatus: Record<ApplicationStatus, number>;
  total: number;
}

export function Pipeline({ byStatus, total }: PipelineProps) {
  const funnel = APPLICATION_STATUSES.filter((s) => s !== "rejected" && s !== "closed");
  const terminal: ApplicationStatus[] = ["rejected", "closed"];
  const max = Math.max(1, ...funnel.map((s) => byStatus[s]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>Where your applications are right now.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your pipeline fills in as you add applications.
          </p>
        ) : (
          <>
            {/* Stacked distribution bar */}
            <div
              className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
              aria-hidden
            >
              {APPLICATION_STATUSES.map((s) =>
                byStatus[s] > 0 ? (
                  <div
                    key={s}
                    style={{
                      width: `${(byStatus[s] / total) * 100}%`,
                      backgroundColor: APPLICATION_STATUS_COLORS[s],
                    }}
                    title={`${APPLICATION_STATUS_LABELS[s]}: ${byStatus[s]}`}
                  />
                ) : null,
              )}
            </div>

            <ol className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              {funnel.map((s) => (
                <li key={s}>
                  <Link
                    href={`/applications?status=${s}`}
                    className="group flex items-center gap-2 rounded-md py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: APPLICATION_STATUS_COLORS[s] }}
                    />
                    <span className="flex-1 truncate text-muted-foreground group-hover:text-foreground">
                      {APPLICATION_STATUS_LABELS[s]}
                    </span>
                    <span className="font-medium tabular-nums">{byStatus[s]}</span>
                    <span className="hidden h-1 w-12 overflow-hidden rounded-full bg-muted sm:block">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(byStatus[s] / max) * 100}%`,
                          backgroundColor: APPLICATION_STATUS_COLORS[s],
                        }}
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>

            <div className="flex gap-4 border-t pt-3 text-xs text-muted-foreground">
              {terminal.map((s) => (
                <Link
                  key={s}
                  href={`/applications?status=${s}`}
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: APPLICATION_STATUS_COLORS[s] }}
                  />
                  {APPLICATION_STATUS_LABELS[s]}{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {byStatus[s]}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
