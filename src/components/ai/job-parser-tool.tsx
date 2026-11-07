"use client";

import { useState } from "react";
import { ClipboardPaste, Plus, Sparkles } from "lucide-react";

import { useQuickAdd } from "@/components/applications/quick-add-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPLOYMENT_TYPE_LABELS,
  RATE_TYPE_LABELS,
  type EmploymentType,
  type RateType,
} from "@/lib/constants";
import type { ParsedJob } from "@/lib/ai/types";

import { AiErrorAlert } from "./ai-error";
import { useAiRequest } from "./use-ai-request";

export function JobParserTool() {
  const [text, setText] = useState("");
  const { data, error, loading, send, retry } =
    useAiRequest<ParsedJob>("/api/ai/parse-job");
  const quickAdd = useQuickAdd();

  return (
    <div className="grid gap-4 *:min-w-0 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Job description</CardTitle>
          <CardDescription>
            Paste the full post. Only the text you paste is sent to the AI provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={18}
            placeholder="Paste the job post here…"
            className="font-mono text-xs leading-relaxed"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {text.length.toLocaleString()} characters
            </span>
            <Button
              onClick={() => send({ text })}
              disabled={loading || text.trim().length < 40}
            >
              {loading ? <Spinner /> : <Sparkles />}
              {loading ? "Parsing…" : "Parse job post"}
            </Button>
          </div>
          {error ? (
            <AiErrorAlert error={error} onRetry={retry} loading={loading} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extracted details</CardTitle>
          <CardDescription>
            Review before saving. Everything is editable in the next step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <ClipboardPaste className="size-6" />
              Parsed fields appear here.
            </div>
          ) : (
            <div className="flex flex-col gap-4 text-sm">
              <div>
                <p className="font-heading text-lg font-semibold">
                  {data.job_title ?? "Untitled role"}
                </p>
                <p className="text-muted-foreground">
                  {data.company ?? "Unknown company"}
                  {data.location ? ` · ${data.location}` : ""}
                </p>
                {data.summary ? (
                  <p className="mt-2 text-muted-foreground">{data.summary}</p>
                ) : null}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <Item
                  label="Pay"
                  value={
                    data.salary_min !== null || data.salary_max !== null
                      ? `${[data.salary_min, data.salary_max].filter((v) => v !== null).join(" – ")} ${data.currency ?? ""} ${data.rate_type ? (RATE_TYPE_LABELS[data.rate_type as RateType]?.toLowerCase() ?? data.rate_type) : ""}`.trim()
                      : null
                  }
                />
                <Item
                  label="Employment"
                  value={
                    data.employment_type
                      ? (EMPLOYMENT_TYPE_LABELS[data.employment_type as EmploymentType] ??
                        data.employment_type)
                      : null
                  }
                />
                <Item
                  label="Hours / week"
                  value={
                    data.hours_per_week !== null ? String(data.hours_per_week) : null
                  }
                />
                <Item label="Working hours" value={data.working_hours} />
                <Item label="Time zone" value={data.timezone} />
                <Item label="Subject line" value={data.required_subject_line} />
              </dl>
              <SkillList
                label="Required skills"
                items={data.required_skills}
                variant="default"
              />
              <SkillList
                label="Preferred skills"
                items={data.preferred_skills}
                variant="secondary"
              />
              <TextList label="Responsibilities" items={data.responsibilities} />
              <TextList label="Screening questions" items={data.screening_questions} />
              <TextList
                label="Required links or assessments"
                items={data.required_links_or_assessments}
              />
              {data.application_instructions ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Application instructions
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {data.application_instructions}
                  </p>
                </div>
              ) : null}
              <div className="flex justify-end border-t pt-3">
                <Button
                  onClick={() => quickAdd.open({ jobDescription: text, parsed: data })}
                >
                  <Plus /> Review and add application
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function SkillList({
  label,
  items,
  variant,
}: {
  label: string;
  items: string[];
  variant: "default" | "secondary";
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((s) => (
          <Badge key={s} variant={variant === "default" ? "outline" : "secondary"}>
            {s}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function TextList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
