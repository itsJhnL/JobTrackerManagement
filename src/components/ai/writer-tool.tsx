"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PenLine, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { updateApplication } from "@/actions/applications";
import { createTemplate } from "@/actions/templates";
import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { WriterKind, WriterOutput } from "@/lib/ai/types";

import { AiErrorAlert } from "./ai-error";
import { ApplicationPicker, type PickerApplication } from "./application-picker";
import { useAiRequest } from "./use-ai-request";

const KINDS: { value: WriterKind; label: string; hint: string }[] = [
  {
    value: "cover_letter",
    label: "Cover letter",
    hint: "180–260 words, tailored to the role",
  },
  {
    value: "application_email",
    label: "Application email",
    hint: "Short email with subject line",
  },
  {
    value: "screening_answer",
    label: "Screening answer",
    hint: "Answer one question from the posting",
  },
  {
    value: "recruiter_message",
    label: "Recruiter message",
    hint: "LinkedIn / platform message",
  },
];
const TONES = ["professional", "friendly", "concise", "enthusiastic"] as const;

export function WriterTool({
  applications,
  initialApplicationId,
}: {
  applications: PickerApplication[];
  initialApplicationId?: string;
}) {
  const router = useRouter();
  const [applicationId, setApplicationId] = useState<string | null>(
    initialApplicationId ?? applications[0]?.id ?? null,
  );
  const [kind, setKind] = useState<WriterKind>("cover_letter");
  const [tone, setTone] = useState<(typeof TONES)[number]>("professional");
  const [question, setQuestion] = useState("");
  const [instructions, setInstructions] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [meta, setMeta] = useState<Pick<WriterOutput, "used_facts" | "gaps"> | null>(
    null,
  );
  const [saving, startSaving] = useTransition();
  const { error, loading, send, retry } = useAiRequest<WriterOutput>("/api/ai/write");

  async function generate() {
    const out = await send({
      application_id: applicationId,
      kind,
      tone,
      question: question || undefined,
      instructions: instructions || undefined,
    });
    if (out) {
      setSubject(out.subject ?? "");
      setBody(out.body);
      setMeta({ used_facts: out.used_facts, gaps: out.gaps });
    }
  }

  const saveToApplication = () =>
    startSaving(async () => {
      if (!applicationId) return;
      const r = await updateApplication({ id: applicationId, cover_letter: body });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Saved as the application's cover letter");
        router.refresh();
      }
    });

  const saveAsTemplate = () =>
    startSaving(async () => {
      const app = applications.find((a) => a.id === applicationId);
      const r = await createTemplate({
        name: `${KINDS.find((k) => k.value === kind)?.label ?? "Draft"}${app ? ` – ${app.company_name}` : ""}`,
        category:
          kind === "cover_letter"
            ? "cover_letter"
            : kind === "recruiter_message"
              ? "recruiter_message"
              : kind === "screening_answer"
                ? "screening"
                : "general",
        subject: subject || null,
        body,
      });
      if (!r.ok) toast.error(r.error);
      else toast.success("Saved to Templates");
    });

  return (
    <div className="grid gap-4 *:min-w-0 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Application writer</CardTitle>
          <CardDescription>
            Drafts from your verified profile only. It will tell you what it could not
            support.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ApplicationPicker
            applications={applications}
            value={applicationId}
            onChange={setApplicationId}
          />
          <Field>
            <FieldLabel>What to write</FieldLabel>
            <Select
              items={KINDS.map((k) => ({ value: k.value, label: k.label }))}
              value={kind}
              onValueChange={(v) => v && setKind(v as WriterKind)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                    <span className="ml-auto pl-2 text-xs text-muted-foreground">
                      {k.hint}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {kind === "screening_answer" ? (
            <Field>
              <FieldLabel htmlFor="writer-question">Screening question</FieldLabel>
              <Textarea
                id="writer-question"
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Paste the question exactly as asked."
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel>Tone</FieldLabel>
            <Select
              items={TONES.map((t) => ({
                value: t,
                label: t.charAt(0).toUpperCase() + t.slice(1),
              }))}
              value={tone}
              onValueChange={(v) => v && setTone(v as (typeof TONES)[number])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="writer-instructions">Extra instructions</FieldLabel>
            <Textarea
              id="writer-instructions"
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Mention my availability from January…"
            />
          </Field>
          <Button
            onClick={generate}
            disabled={
              loading ||
              !applicationId ||
              (kind === "screening_answer" && !question.trim())
            }
          >
            {loading ? <Spinner /> : <Sparkles />}
            {loading ? "Writing…" : body ? "Regenerate" : "Generate draft"}
          </Button>
          {error ? (
            <AiErrorAlert error={error} onRetry={retry} loading={loading} />
          ) : null}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Draft</CardTitle>
          <CardDescription>
            Edit freely. Nothing is sent or saved until you choose to.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!body && !loading ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <PenLine className="size-6" />
              Your draft appears here.
            </div>
          ) : (
            <>
              {kind === "application_email" || subject ? (
                <Field>
                  <FieldLabel htmlFor="writer-subject">Subject</FieldLabel>
                  <Input
                    id="writer-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="writer-body">Body</FieldLabel>
                <Textarea
                  id="writer-body"
                  rows={16}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="leading-relaxed"
                />
              </Field>
              {meta ? (
                <div className="grid gap-3 text-xs sm:grid-cols-2">
                  <div className="rounded-lg border bg-muted/30 p-2.5">
                    <p className="mb-1 font-medium">Profile facts used</p>
                    {meta.used_facts.length ? (
                      <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                        {meta.used_facts.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">None cited.</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                    <p className="mb-1 font-medium text-amber-700 dark:text-amber-300">
                      Could not address from your profile
                    </p>
                    {meta.gaps.length ? (
                      <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                        {meta.gaps.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">No gaps reported.</p>
                    )}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                <CopyButton text={subject ? `Subject: ${subject}\n\n${body}` : body} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveAsTemplate}
                  disabled={saving || !body}
                >
                  <Save /> Save as template
                </Button>
                {kind === "cover_letter" ? (
                  <Button
                    size="sm"
                    onClick={saveToApplication}
                    disabled={saving || !body || !applicationId}
                  >
                    <Save /> Save to application
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
