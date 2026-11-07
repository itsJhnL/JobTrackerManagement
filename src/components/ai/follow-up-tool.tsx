"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BellPlus, MessageSquareText, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { createFollowUp } from "@/actions/follow-ups";
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
import type { FollowUpDraft } from "@/lib/ai/types";
import { suggestDueDateString } from "@/lib/follow-ups";

import { AiErrorAlert } from "./ai-error";
import { ApplicationPicker, type PickerApplication } from "./application-picker";
import { useAiRequest } from "./use-ai-request";

const TONES = ["professional", "friendly", "concise"] as const;

export function FollowUpTool({
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
  const [tone, setTone] = useState<(typeof TONES)[number]>("professional");
  const [instructions, setInstructions] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState(() =>
    suggestDueDateString("general", new Date()),
  );
  const [saving, startSaving] = useTransition();
  const { error, loading, send, retry } =
    useAiRequest<FollowUpDraft>("/api/ai/follow-up");

  async function generate() {
    const out = await send({
      application_id: applicationId,
      tone,
      instructions: instructions || undefined,
    });
    if (out) {
      setSubject(out.subject ?? "");
      setBody(out.body);
    }
  }

  const schedule = () =>
    startSaving(async () => {
      if (!applicationId) return;
      const r = await createFollowUp({
        application_id: applicationId,
        follow_up_type: "general",
        title: subject || "Follow-up",
        due_date: dueDate,
        priority: "medium",
        status: "pending",
        message_draft: body,
      });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Follow-up scheduled with this draft attached");
        router.refresh();
      }
    });

  return (
    <div className="grid gap-4 *:min-w-0 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Follow-up message</CardTitle>
          <CardDescription>
            Uses the company, role, status, last message and how many times you have
            followed up already.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ApplicationPicker
            applications={applications}
            value={applicationId}
            onChange={setApplicationId}
          />
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
            <FieldLabel htmlFor="fu-instructions">Extra context</FieldLabel>
            <Textarea
              id="fu-instructions"
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="They said they would decide by Friday…"
            />
          </Field>
          <Button onClick={generate} disabled={loading || !applicationId}>
            {loading ? <Spinner /> : <Sparkles />}
            {loading ? "Drafting…" : body ? "Regenerate" : "Draft follow-up"}
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
            Review, edit, then copy it into your email client or attach it to a reminder.
            Nothing is sent from here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!body && !loading ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <MessageSquareText className="size-6" />
              Your draft appears here.
            </div>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="fu-subject">Subject</FieldLabel>
                <Input
                  id="fu-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fu-body">Message</FieldLabel>
                <Textarea
                  id="fu-body"
                  rows={10}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="leading-relaxed"
                />
              </Field>
              <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
                <Field className="w-44">
                  <FieldLabel htmlFor="fu-due">Remind me on</FieldLabel>
                  <Input
                    id="fu-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </Field>
                <div className="flex items-center gap-2">
                  <CopyButton text={subject ? `Subject: ${subject}\n\n${body}` : body} />
                  <Button
                    size="sm"
                    onClick={schedule}
                    disabled={saving || !body || !applicationId || !dueDate}
                  >
                    <BellPlus /> Schedule with draft
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
