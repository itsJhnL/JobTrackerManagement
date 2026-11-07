"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { ArrowLeft, ClipboardPaste, PencilLine, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { createApplication } from "@/actions/applications";
import {
  DateField,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
  toOptions,
} from "@/components/forms/fields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  CURRENCIES,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  RATE_TYPES,
  RATE_TYPE_LABELS,
} from "@/lib/constants";
import type { ParsedJob } from "@/lib/ai/types";
import {
  quickApplicationSchema,
  type QuickApplicationInput,
} from "@/lib/validations/application";

import type { QuickAddDefaults, QuickAddInitial } from "./quick-add-provider";

type Step = "choose" | "manual" | "paste" | "review";

interface QuickAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: QuickAddDefaults;
  initial?: QuickAddInitial;
}

const statusOptions = toOptions(APPLICATION_STATUSES, APPLICATION_STATUS_LABELS);
const employmentOptions = toOptions(EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS);
const rateTypeOptions = toOptions(RATE_TYPES, RATE_TYPE_LABELS);
const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));

function baseValues(defaults: QuickAddDefaults): QuickApplicationInput {
  return {
    company_name: "",
    job_title: "",
    job_url: "",
    platform: "",
    employment_type: null,
    status: "saved",
    applied_at: "",
    offered_rate: "",
    proposed_rate: "",
    currency: (CURRENCIES as readonly string[]).includes(defaults.currency)
      ? (defaults.currency as QuickApplicationInput["currency"])
      : "USD",
    rate_type: "hourly",
    hours_per_week: defaults.hoursPerWeek,
    job_description: "",
    timezone: defaults.timezone,
    notes: "",
  };
}

export function QuickAddSheet({
  open,
  onOpenChange,
  defaults,
  initial,
}: QuickAddSheetProps) {
  const router = useRouter();
  // The provider remounts this component on every open, so initial state is fresh.
  const [step, setStep] = useState<Step>(
    initial?.parsed ? "review" : initial?.jobDescription ? "paste" : "choose",
  );
  const [jobText, setJobText] = useState(initial?.jobDescription ?? "");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<{
    message: string;
    retryable: boolean;
    code?: string;
  } | null>(null);
  const [parsed, setParsed] = useState<ParsedJob | null>(initial?.parsed ?? null);
  const [pending, startTransition] = useTransition();

  const form = useForm<QuickApplicationInput>({
    resolver: zodResolver(quickApplicationSchema),
    defaultValues: initial?.parsed
      ? valuesFromParsed(
          baseValues(defaults),
          initial.parsed,
          initial.jobDescription ?? "",
        )
      : baseValues(defaults),
  });

  async function parseWithAi() {
    if (jobText.trim().length < 40) {
      toast.error("Paste the full job post first (at least a few lines).");
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const res = await fetch("/api/ai/parse-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: jobText }),
      });
      const json = (await res.json()) as {
        data?: ParsedJob;
        error?: string;
        code?: string;
        retryable?: boolean;
      };
      if (!res.ok || !json.data) {
        setParseError({
          message: json.error ?? "The AI service returned an unexpected response.",
          retryable: json.retryable ?? res.status >= 500,
          code: json.code,
        });
        return;
      }
      applyParsed(json.data);
      setStep("review");
    } catch {
      setParseError({
        message: "Could not reach the AI service. Check your connection and try again.",
        retryable: true,
      });
    } finally {
      setParsing(false);
    }
  }

  function applyParsed(p: ParsedJob) {
    setParsed(p);
    form.reset(valuesFromParsed(form.getValues(), p, jobText));
  }

  const submit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await createApplication(values, { quick: true });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Application added", {
        action: {
          label: "Open",
          onClick: () => router.push(`/applications/${result.data.id}`),
        },
      });
      onOpenChange(false);
      router.refresh();
    });
  });

  const c = form.control;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        showCloseButton
      >
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-center gap-2">
            {step !== "choose" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Back"
                onClick={() => setStep(step === "review" ? "paste" : "choose")}
              >
                <ArrowLeft />
              </Button>
            ) : null}
            <div>
              <SheetTitle>
                {step === "choose" && "Add application"}
                {step === "manual" && "New application"}
                {step === "paste" && "Paste job description"}
                {step === "review" && "Review extracted details"}
              </SheetTitle>
              <SheetDescription>
                {step === "choose" &&
                  "Enter details by hand or let AI pull them from a job post."}
                {step === "manual" &&
                  "Just the essentials. You can add more on the detail page."}
                {step === "paste" &&
                  "Paste the full post. Nothing is saved until you review it."}
                {step === "review" &&
                  "Everything below is editable. Check it before saving."}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 scrollbar-thin overflow-y-auto px-5 py-4">
          {step === "choose" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard
                icon={PencilLine}
                title="Enter manually"
                description="Company, role, status and rate. Takes under a minute."
                onClick={() => setStep("manual")}
              />
              <ChoiceCard
                icon={ClipboardPaste}
                title="Paste job description"
                description="AI extracts company, title, skills, pay and questions for review."
                onClick={() => setStep("paste")}
                accent
              />
            </div>
          ) : null}

          {step === "paste" ? (
            <div className="flex flex-col gap-3">
              <Textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                rows={16}
                placeholder="Paste the job post here…"
                className="font-mono text-xs leading-relaxed"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {jobText.length.toLocaleString()} characters
              </p>
              {parseError ? (
                <Alert variant="destructive">
                  <AlertTitle>
                    {parseError.code === "quota_exceeded"
                      ? "AI quota exceeded"
                      : parseError.code === "not_configured"
                        ? "AI is not configured"
                        : "Could not parse the job post"}
                  </AlertTitle>
                  <AlertDescription>
                    {parseError.message}
                    {parseError.code === "not_configured"
                      ? " Add GEMINI_API_KEY to your environment, or enter the details manually."
                      : null}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          {step === "manual" || step === "review" ? (
            <form
              id="quick-add-form"
              onSubmit={submit}
              className="flex flex-col gap-4"
              noValidate
            >
              {step === "review" && parsed ? <ParsedSummary parsed={parsed} /> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={c} name="company_name" label="Company" required />
                <TextField control={c} name="job_title" label="Job title" required />
                <TextField
                  control={c}
                  name="job_url"
                  label="Job URL"
                  placeholder="https://…"
                />
                <TextField
                  control={c}
                  name="platform"
                  label="Platform"
                  placeholder="LinkedIn, Upwork…"
                />
                <SelectField
                  control={c}
                  name="status"
                  label="Status"
                  options={statusOptions}
                />
                <DateField control={c} name="applied_at" label="Applied on" />
                <SelectField
                  control={c}
                  name="employment_type"
                  label="Employment type"
                  options={employmentOptions}
                  allowEmpty
                  emptyLabel="Not specified"
                />
                <TextField control={c} name="timezone" label="Time zone" />
                <SelectField
                  control={c}
                  name="currency"
                  label="Currency"
                  options={currencyOptions}
                />
                <SelectField
                  control={c}
                  name="rate_type"
                  label="Rate type"
                  options={rateTypeOptions}
                />
                <NumberField
                  control={c}
                  name="offered_rate"
                  label="Offered rate"
                  min={0}
                />
                <NumberField
                  control={c}
                  name="proposed_rate"
                  label="My proposed rate"
                  min={0}
                />
                <NumberField
                  control={c}
                  name="hours_per_week"
                  label="Hours per week"
                  min={0}
                  max={168}
                  suffix="h/wk"
                />
              </div>
              {step === "manual" ? (
                <TextareaField
                  control={c}
                  name="job_description"
                  label="Job description"
                  rows={5}
                  placeholder="Optional. Paste the post for later reference."
                />
              ) : null}
              <TextareaField
                control={c}
                name="notes"
                label="Notes"
                rows={step === "review" ? 6 : 3}
              />
            </form>
          ) : null}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t px-5 py-3">
          {step === "paste" ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep("manual")}
                disabled={parsing}
              >
                Skip, enter manually
              </Button>
              <Button
                onClick={parseWithAi}
                disabled={parsing || jobText.trim().length === 0}
              >
                {parsing ? (
                  <Spinner />
                ) : parseError?.retryable ? (
                  <RefreshCw />
                ) : (
                  <Sparkles />
                )}
                {parsing ? "Parsing…" : parseError?.retryable ? "Retry" : "Parse with AI"}
              </Button>
            </>
          ) : null}
          {step === "manual" || step === "review" ? (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" form="quick-add-form" disabled={pending}>
                {pending ? <Spinner /> : null}
                {pending ? "Saving…" : "Save application"}
              </Button>
            </>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  description,
  onClick,
  accent,
}: {
  icon: typeof PencilLine;
  title: string;
  description: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span
        className={
          accent
            ? "flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            : "flex size-8 items-center justify-center rounded-lg bg-muted text-foreground"
        }
      >
        <Icon className="size-4" />
      </span>
      <span className="font-medium">{title}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </button>
  );
}

function ParsedSummary({ parsed }: { parsed: ParsedJob }) {
  const chips = [
    ...parsed.required_skills.slice(0, 8).map((s) => ({ s, kind: "req" as const })),
    ...parsed.preferred_skills.slice(0, 4).map((s) => ({ s, kind: "pref" as const })),
  ];
  return (
    <Alert>
      <Sparkles />
      <AlertTitle>Extracted by AI — verify before saving</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        {parsed.summary ? <p>{parsed.summary}</p> : null}
        {chips.length ? (
          <div className="flex flex-wrap gap-1">
            {chips.map(({ s, kind }) => (
              <span
                key={`${kind}-${s}`}
                className={
                  kind === "req"
                    ? "rounded-md bg-primary/10 px-1.5 py-0.5 text-xs"
                    : "rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                }
              >
                {s}
              </span>
            ))}
          </div>
        ) : null}
        {parsed.screening_questions.length ? (
          <p className="text-xs">
            {parsed.screening_questions.length} screening question
            {parsed.screening_questions.length === 1 ? "" : "s"} detected — saved to
            notes.
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function valuesFromParsed(
  current: QuickApplicationInput,
  p: ParsedJob,
  jobText: string,
): QuickApplicationInput {
  const rate = p.salary_min ?? p.salary_max ?? null;
  return {
    ...current,
    company_name: p.company ?? current.company_name,
    job_title: p.job_title ?? current.job_title,
    employment_type: isOneOf(p.employment_type, EMPLOYMENT_TYPES)
      ? p.employment_type
      : current.employment_type,
    rate_type: isOneOf(p.rate_type, RATE_TYPES) ? p.rate_type : current.rate_type,
    currency: isOneOf(p.currency, CURRENCIES) ? p.currency : current.currency,
    offered_rate: rate ?? current.offered_rate,
    hours_per_week: p.hours_per_week ?? current.hours_per_week,
    timezone: p.timezone ?? current.timezone,
    job_description: jobText || current.job_description,
    notes: buildNotes(p),
  };
}

function buildNotes(p: ParsedJob) {
  const parts: string[] = [];
  if (p.application_instructions)
    parts.push(`Application instructions:\n${p.application_instructions}`);
  if (p.required_subject_line)
    parts.push(`Required subject line: ${p.required_subject_line}`);
  if (p.screening_questions.length)
    parts.push(
      `Screening questions:\n${p.screening_questions.map((q) => `- ${q}`).join("\n")}`,
    );
  if (p.required_links_or_assessments.length)
    parts.push(
      `Required links / assessments:\n${p.required_links_or_assessments.map((q) => `- ${q}`).join("\n")}`,
    );
  if (p.working_hours) parts.push(`Working hours: ${p.working_hours}`);
  if (p.salary_min !== null || p.salary_max !== null) {
    parts.push(
      `Stated pay: ${[p.salary_min, p.salary_max].filter((v) => v !== null).join(" – ")} ${p.currency ?? ""} ${p.rate_type ?? ""}`.trim(),
    );
  }
  return parts.join("\n\n");
}

function isOneOf<const T extends readonly string[]>(
  value: string | null | undefined,
  list: T,
): value is T[number] {
  return !!value && (list as readonly string[]).includes(value);
}
