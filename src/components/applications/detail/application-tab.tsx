import { FileText } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants";
import type { DocumentRow } from "@/lib/supabase/database.types";
import type { ApplicationRow } from "@/lib/supabase/database.types";
import type { ScreeningAnswer } from "@/lib/validations/application";
import { formatDate } from "@/lib/format";

import { KeyValueList, Prose, Section } from "./section";

interface ApplicationTabProps {
  application: ApplicationRow;
  screeningAnswers: ScreeningAnswer[];
  documents: DocumentRow[];
}

export function ApplicationTab({
  application: a,
  screeningAnswers,
  documents,
}: ApplicationTabProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Section
          title="Cover letter"
          description="What you submitted with the application."
        >
          <Prose text={a.cover_letter} />
        </Section>
        <Section
          title="Screening questions"
          description={
            screeningAnswers.length ? `${screeningAnswers.length} answered` : undefined
          }
        >
          {screeningAnswers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No screening questions recorded.
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {screeningAnswers.map((q, i) => (
                <li key={i} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{q.question}</p>
                  <Prose
                    text={q.answer || null}
                    className="mt-1.5 text-muted-foreground"
                  />
                </li>
              ))}
            </ol>
          )}
        </Section>
        {a.application_notes ? (
          <Section title="Application notes">
            <Prose text={a.application_notes} />
          </Section>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        <Section title="Materials">
          <KeyValueList
            columns={1}
            items={[
              { label: "Resume version", value: a.resume_version },
              {
                label: "Portfolio links",
                value: a.portfolio_links.length ? (
                  <ul className="flex flex-col gap-1">
                    {a.portfolio_links.map((l) => (
                      <li key={l}>
                        <a
                          href={l}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all underline underline-offset-4 hover:text-foreground"
                        >
                          {l}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null,
              },
            ]}
          />
        </Section>
        <Section title="Documents">
          {documents.length === 0 ? (
            <EmptyState
              size="sm"
              icon={FileText}
              title="No documents"
              description="Upload resumes and offers from the Tasks tab."
            />
          ) : (
            <ul className="flex flex-col divide-y">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {DOCUMENT_TYPE_LABELS[d.document_type]} · {formatDate(d.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
