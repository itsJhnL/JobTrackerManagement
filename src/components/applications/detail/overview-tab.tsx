import {
  EMPLOYMENT_TYPE_LABELS,
  PAYMENT_FREQUENCY_LABELS,
  type PaymentFrequency,
} from "@/lib/constants";
import type { ApplicationRow } from "@/lib/supabase/database.types";
import { formatDate, formatHours } from "@/lib/format";

import { StatusBadge } from "../status-badge";
import { KeyValueList, Prose, Section } from "./section";

export function OverviewTab({ application: a }: { application: ApplicationRow }) {
  return (
    <div className="grid gap-4 *:min-w-0 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Section title="Job description">
          <Prose
            text={a.job_description}
            className="max-h-[32rem] scrollbar-thin overflow-y-auto"
          />
        </Section>
        {a.notes ? (
          <Section title="Notes">
            <Prose text={a.notes} />
          </Section>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        <Section title="Company">
          <KeyValueList
            columns={1}
            items={[
              { label: "Company", value: a.company_name },
              { label: "Role", value: a.job_title },
              { label: "Location", value: a.location },
              { label: "Platform", value: a.platform },
              {
                label: "Job URL",
                value: a.job_url ? (
                  <a
                    href={a.job_url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all underline underline-offset-4 hover:text-foreground"
                  >
                    {a.job_url}
                  </a>
                ) : null,
              },
            ]}
          />
        </Section>
        <Section title="Application">
          <KeyValueList
            columns={1}
            items={[
              { label: "Status", value: <StatusBadge status={a.status} /> },
              {
                label: "Applied on",
                value: a.applied_at ? formatDate(a.applied_at) : null,
              },
              {
                label: "Employment type",
                value: a.employment_type
                  ? EMPLOYMENT_TYPE_LABELS[a.employment_type]
                  : null,
              },
              {
                label: "Hours per week",
                value: a.hours_per_week ? formatHours(a.hours_per_week) : null,
              },
              { label: "Time zone", value: a.timezone },
              { label: "Schedule", value: a.work_schedule },
              { label: "Shift", value: a.shift },
              {
                label: "Payment frequency",
                value: a.payment_frequency
                  ? (PAYMENT_FREQUENCY_LABELS[a.payment_frequency as PaymentFrequency] ??
                    a.payment_frequency)
                  : null,
              },
              { label: "Created", value: formatDate(a.created_at) },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
