"use client";

import { useState } from "react";
import { GraduationCap, Sparkles } from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { InterviewPrep } from "@/lib/ai/types";

import { AiErrorAlert } from "./ai-error";
import { ApplicationPicker, type PickerApplication } from "./application-picker";
import { useAiRequest } from "./use-ai-request";

export function InterviewPrepTool({
  applications,
  initialApplicationId,
}: {
  applications: PickerApplication[];
  initialApplicationId?: string;
}) {
  const [applicationId, setApplicationId] = useState<string | null>(
    initialApplicationId ?? applications[0]?.id ?? null,
  );
  const { data, error, loading, send, retry } = useAiRequest<InterviewPrep>(
    "/api/ai/interview-prep",
  );

  const asText = data
    ? [
        "LIKELY QUESTIONS",
        ...data.likely_questions.map((q) => `- ${q}`),
        "",
        "TECHNICAL QUESTIONS",
        ...data.technical_questions.map((q) => `- ${q}`),
        "",
        "BEHAVIORAL QUESTIONS",
        ...data.behavioral_questions.map((q) => `- ${q}`),
        "",
        "SUGGESTED ANSWERS",
        ...data.suggested_answers.flatMap((a) => [
          `Q: ${a.question}`,
          `A: ${a.answer}`,
          a.based_on.length ? `   (based on: ${a.based_on.join("; ")})` : "",
          "",
        ]),
        "QUESTIONS TO ASK",
        ...data.questions_to_ask.map((q) => `- ${q}`),
      ].join("\n")
    : "";

  return (
    <div className="grid gap-4 *:min-w-0 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Interview preparation</CardTitle>
          <CardDescription>
            Questions tailored to the job description, with suggested answers drawn only
            from your verified profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ApplicationPicker
            applications={applications}
            value={applicationId}
            onChange={setApplicationId}
          />
          <Button
            onClick={() => send({ application_id: applicationId })}
            disabled={loading || !applicationId}
          >
            {loading ? <Spinner /> : <Sparkles />}
            {loading ? "Preparing…" : data ? "Regenerate" : "Prepare me"}
          </Button>
          {error ? (
            <AiErrorAlert error={error} onRetry={retry} loading={loading} />
          ) : null}
          <p className="text-xs text-muted-foreground">
            Takes 10–30 seconds. Suggested answers are starting points; rewrite them in
            your own words.
          </p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Prep sheet</CardTitle>
          {data ? (
            <CardDescription className="flex items-center justify-between">
              <span>Grounded in your profile; anything missing is called out.</span>
              <CopyButton text={asText} size="xs" variant="ghost" label="Copy all" />
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <GraduationCap className="size-6" />
              Pick an application with a job description and run the prep.
            </div>
          ) : (
            <div className="flex flex-col gap-5 text-sm">
              <QuestionList title="Likely questions" items={data.likely_questions} />
              <QuestionList
                title="Technical questions"
                items={data.technical_questions}
              />
              <QuestionList
                title="Behavioral questions"
                items={data.behavioral_questions}
              />
              <div>
                <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Suggested answers
                </h3>
                <ol className="flex flex-col gap-3">
                  {data.suggested_answers.map((a, i) => (
                    <li key={i} className="rounded-lg border p-3">
                      <p className="font-medium">{a.question}</p>
                      <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">
                        {a.answer}
                      </p>
                      {a.based_on.length ? (
                        <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                          Based on: {a.based_on.join("; ")}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                          No specific profile fact cited — verify before using.
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
              <QuestionList title="Questions to ask them" items={data.questions_to_ask} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuestionList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <ol className="list-decimal space-y-1 pl-5">
        {items.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ol>
    </div>
  );
}
