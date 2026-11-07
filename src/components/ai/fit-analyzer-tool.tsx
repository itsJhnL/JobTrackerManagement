"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Sparkles, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { FitAnalysis } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

import { AiErrorAlert } from "./ai-error";
import { ApplicationPicker, type PickerApplication } from "./application-picker";
import { TextList } from "./job-parser-tool";
import { useAiRequest } from "./use-ai-request";

export function FitAnalyzerTool({
  applications,
  initialApplicationId,
}: {
  applications: PickerApplication[];
  initialApplicationId?: string;
}) {
  const [mode, setMode] = useState<"application" | "paste">(
    initialApplicationId || applications.length ? "application" : "paste",
  );
  const [applicationId, setApplicationId] = useState<string | null>(
    initialApplicationId ?? applications[0]?.id ?? null,
  );
  const [jobText, setJobText] = useState("");
  const { data, error, loading, send, retry } =
    useAiRequest<FitAnalysis>("/api/ai/analyze-fit");

  const canRun = mode === "application" ? !!applicationId : jobText.trim().length >= 40;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Job fit</CardTitle>
          <CardDescription>
            Compares a job description against your saved skills, experience and projects.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "application" | "paste")}>
            <TabsList className="w-full">
              <TabsTrigger value="application" className="flex-1">
                Saved application
              </TabsTrigger>
              <TabsTrigger value="paste" className="flex-1">
                Paste description
              </TabsTrigger>
            </TabsList>
            <TabsContent value="application" className="pt-3">
              <ApplicationPicker
                applications={applications}
                value={applicationId}
                onChange={setApplicationId}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Uses the job description stored on the application.
              </p>
            </TabsContent>
            <TabsContent value="paste" className="pt-3">
              <Textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                rows={12}
                placeholder="Paste a job description…"
                className="font-mono text-xs"
              />
            </TabsContent>
          </Tabs>
          <Button
            onClick={() =>
              send(
                mode === "application"
                  ? { application_id: applicationId }
                  : { job_text: jobText },
              )
            }
            disabled={loading || !canRun}
          >
            {loading ? <Spinner /> : <Sparkles />}
            {loading ? "Analysing…" : "Analyse fit"}
          </Button>
          {error ? (
            <AiErrorAlert error={error} onRetry={retry} loading={loading} />
          ) : null}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Result</CardTitle>
          <CardDescription>
            Verified evidence comes from your profile. Assumptions are the model&apos;s
            guesses and are listed separately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <Target className="size-6" />
              Run an analysis to see how well you match.
            </div>
          ) : (
            <div className="flex flex-col gap-5 text-sm">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "font-heading text-4xl font-semibold tabular-nums",
                    data.match_percentage >= 70
                      ? "text-emerald-600 dark:text-emerald-400"
                      : data.match_percentage >= 45
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {Math.round(data.match_percentage)}%
                </div>
                <div className="flex-1">
                  <p className="font-medium">Estimated match</p>
                  <Progress value={data.match_percentage} className="mt-1.5">
                    <ProgressTrack>
                      <ProgressIndicator />
                    </ProgressTrack>
                  </Progress>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A model estimate, not a hiring decision.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Skills
                  label="Matching skills"
                  items={data.matching_skills}
                  tone="good"
                />
                <Skills label="Missing skills" items={data.missing_skills} tone="bad" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-3.5" /> Verified from your profile
                  </p>
                  {data.verified_evidence.length ? (
                    <ul className="list-disc space-y-0.5 pl-5 text-xs">
                      {data.verified_evidence.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Nothing in your profile directly supports this role yet.
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <CircleAlert className="size-3.5" /> AI assumptions (unverified)
                  </p>
                  {data.assumptions.length ? (
                    <ul className="list-disc space-y-0.5 pl-5 text-xs">
                      {data.assumptions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No assumptions were made.
                    </p>
                  )}
                </div>
              </div>

              <TextList label="Experience gaps" items={data.experience_gaps} />
              <TextList label="Potential concerns" items={data.potential_concerns} />
              <TextList label="Recommendations" items={data.recommendations} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Skills({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "good" | "bad";
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      {items.length ? (
        <div className="flex flex-wrap gap-1">
          {items.map((s) => (
            <Badge
              key={s}
              variant="outline"
              className={
                tone === "good"
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300"
              }
            >
              {s}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">None.</p>
      )}
    </div>
  );
}
