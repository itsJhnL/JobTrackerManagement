import Link from "next/link";
import { Archive, CalendarDays, ExternalLink, MapPin, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/constants";
import type { ApplicationRow } from "@/lib/supabase/database.types";
import { formatDate, formatRate, formatTimeAgo, initials } from "@/lib/format";
import { effectiveRate } from "@/lib/compensation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { ApplicationRowActions } from "../row-actions";
import { StatusSelect } from "../status-select";

export function DetailHeader({ application: a }: { application: ApplicationRow }) {
  const { rate, source } = effectiveRate(a);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar className="size-11 rounded-lg">
            <AvatarFallback className="rounded-lg text-sm font-medium">
              {initials(a.company_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
                {a.company_name}
              </h1>
              {a.archived_at ? (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Archive /> Archived
                </Badge>
              ) : null}
            </div>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span>{a.job_title}</span>
              {a.job_url ? (
                <a
                  href={a.job_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" /> Job post
                </a>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusSelect
            id={a.id}
            status={a.status}
            size="default"
            className="h-8 px-3 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/applications/${a.id}/edit`} />}
          >
            <Pencil data-icon="inline-start" />
            Edit
          </Button>
          <ApplicationRowActions
            id={a.id}
            companyName={a.company_name}
            jobUrl={a.job_url}
            archived={!!a.archived_at}
            afterDeleteHref="/applications"
            size="icon-sm"
          />
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {rate !== null ? (
          <Meta
            label={
              source === "negotiated"
                ? "Negotiated"
                : source === "offered"
                  ? "Offered"
                  : "Proposed"
            }
          >
            <span className="font-medium tabular-nums">
              {formatRate(rate, a.currency, a.rate_type)}
            </span>
          </Meta>
        ) : null}
        {a.employment_type ? (
          <Meta label="Type">{EMPLOYMENT_TYPE_LABELS[a.employment_type]}</Meta>
        ) : null}
        {a.platform ? <Meta label="Platform">{a.platform}</Meta> : null}
        {a.location ? (
          <Meta label="Location">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 text-muted-foreground" /> {a.location}
            </span>
          </Meta>
        ) : null}
        {a.applied_at ? (
          <Meta label="Applied">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarDays className="size-3.5 text-muted-foreground" />{" "}
              {formatDate(a.applied_at)}
            </span>
          </Meta>
        ) : null}
        <Meta label="Updated">
          <span className="tabular-nums">{formatTimeAgo(a.updated_at)}</span>
        </Meta>
      </dl>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
