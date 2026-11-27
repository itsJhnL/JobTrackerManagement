"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, Plus } from "lucide-react";
import { toast } from "sonner";

import { confirmEmail } from "@/actions/integrations";
import { celebrateHire } from "@/components/applications/hire-celebration";
import { useFormat } from "@/components/timezone-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EmailAnalysis } from "@/lib/ai/types";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  type ApplicationStatus,
  type InterviewType,
} from "@/lib/constants";
import type { EmailMessageWithApplication } from "@/lib/data/integrations";
import { displaySubject } from "@/lib/inbox";
import { cn } from "@/lib/utils";

/** Select values for the two choices that are not an existing application. */
const NEW_APPLICATION = "__new__";
const NO_APPLICATION = "__none__";

export interface ReviewApplication {
  id: string;
  company_name: string;
  job_title: string;
  status: ApplicationStatus;
}

/** Review of one detected email: link it, create an interview, update the status. */
export function ReviewForm({
  email,
  applications,
  calendarReady,
  onDone,
}: {
  email: EmailMessageWithApplication;
  applications: ReviewApplication[];
  calendarReady: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const fmt = useFormat();
  const [pending, start] = useTransition();
  const x = (email.extracted ?? {}) as Partial<EmailAnalysis> & {
    alternatives?: { id: string; score: number }[];
  };
  const isInterview =
    email.classification === "interview_invitation" ||
    email.classification === "interview_reschedule";
  const suggested = (
    x.suggested_status &&
    (APPLICATION_STATUSES as readonly string[]).includes(x.suggested_status)
      ? x.suggested_status
      : null
  ) as ApplicationStatus | null;

  const [applicationId, setApplicationId] = useState<string>(
    email.application_id ??
      x.alternatives?.[0]?.id ??
      (x.company && x.job_title ? NEW_APPLICATION : ""),
  );
  const [newCompany, setNewCompany] = useState(x.company ?? "");
  const [newTitle, setNewTitle] = useState(x.job_title ?? "");
  const isNew = applicationId === NEW_APPLICATION;
  const noApplication = applicationId === NO_APPLICATION;
  const suggestedIds = new Set((x.alternatives ?? []).map((a) => a.id));
  // Suggested matches first, then the rest in their usual order.
  const orderedApplications = [
    ...applications.filter((a) => suggestedIds.has(a.id)),
    ...applications.filter((a) => !suggestedIds.has(a.id)),
  ];
  const canSubmit =
    !!applicationId && (!isNew || (newCompany.trim() !== "" && newTitle.trim() !== ""));
  const [createInterview, setCreateInterview] = useState(
    isInterview && !!x.interview_start,
  );
  const [scheduledAt, setScheduledAt] = useState(
    x.interview_start ? fmt.toInput(x.interview_start) : "",
  );
  const [interviewType, setInterviewType] = useState<InterviewType>("video");
  const [platform, setPlatform] = useState(x.interview_platform ?? "");
  const [meetingUrl, setMeetingUrl] = useState(x.meeting_url ?? "");
  const [interviewer, setInterviewer] = useState(x.recruiter_name ?? "");
  const [notes, setNotes] = useState(x.instructions ?? "");
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [applyStatus, setApplyStatus] = useState<string>(suggested ?? "");
  const [logCommunication, setLogCommunication] = useState(true);

  const submit = () =>
    start(async () => {
      const r = await confirmEmail({
        id: email.id,
        application_id: isNew || noApplication ? undefined : applicationId,
        new_application: isNew
          ? { company_name: newCompany.trim(), job_title: newTitle.trim() }
          : undefined,
        create_interview: createInterview && !noApplication,
        interview_title: x.job_title ? `Interview · ${x.job_title}` : undefined,
        interview_type: interviewType,
        scheduled_at:
          createInterview && scheduledAt ? fmt.fromInput(scheduledAt) : undefined,
        timezone: fmt.timeZone,
        platform: platform || undefined,
        meeting_url: meetingUrl || undefined,
        interviewer: interviewer || undefined,
        notes: notes || undefined,
        add_to_calendar: addToCalendar,
        apply_status: applyStatus || null,
        log_communication: logCommunication,
      });
      if (!r.ok) toast.error(r.error);
      else {
        celebrateHire(r.data.celebrate);
        toast.success(
          noApplication
            ? "Marked as handled"
            : createInterview
              ? "Interview saved"
              : isNew
                ? "Application saved and email linked"
                : "Email linked",
        );
        onDone();
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">{displaySubject(email.subject)}</p>
        <p className="text-xs text-muted-foreground">
          {email.from_name ?? ""} {email.from_email ? `<${email.from_email}>` : ""} ·{" "}
          {fmt.dateTime(email.received_at)}
        </p>
        {email.snippet ? (
          <p className="mt-2 line-clamp-4 text-xs text-muted-foreground">
            {email.snippet}
          </p>
        ) : null}
      </div>

      <Field>
        <FieldLabel>Application</FieldLabel>
        <Select
          items={[
            { value: NEW_APPLICATION, label: "New application from this email" },
            { value: NO_APPLICATION, label: "Not about a specific job" },
            ...applications.map((a) => ({
              value: a.id,
              label: `${a.company_name} · ${a.job_title}`,
            })),
          ]}
          value={applicationId || null}
          onValueChange={(v) => setApplicationId(v ? String(v) : "")}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose the application this email belongs to" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEW_APPLICATION}>
              <Plus className="size-3.5" /> New application from this email
            </SelectItem>
            <SelectItem value={NO_APPLICATION}>
              <span className="text-muted-foreground">Not about a specific job</span>
            </SelectItem>
            {orderedApplications.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.company_name}{" "}
                <span className="text-muted-foreground">· {a.job_title}</span>
                {x.alternatives?.some((alt) => alt.id === a.id) ? (
                  <span className="ml-auto pl-2 text-xs text-muted-foreground">
                    suggested
                  </span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isNew ? null : noApplication ? (
          <FieldDescription>
            The email is marked as handled and not linked to any application.
          </FieldDescription>
        ) : !email.application_id ? (
          <FieldDescription>
            We could not match this confidently
            {x.company ? ` (the email mentions ${x.company})` : ""}. Pick one, or choose
            &ldquo;New application from this email&rdquo;.
          </FieldDescription>
        ) : null}
      </Field>

      {isNew ? (
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="rv-company">Company</FieldLabel>
            <Input
              id="rv-company"
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              placeholder="e.g. Bluedog"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rv-title">Job title</FieldLabel>
            <Input
              id="rv-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Software QA Engineer"
            />
          </Field>
          <FieldDescription className="sm:col-span-2">
            If you already track this company and role, that application is used instead
            of creating a duplicate.
          </FieldDescription>
        </div>
      ) : null}

      {noApplication ? null : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={createInterview}
              onCheckedChange={(v) => setCreateInterview(!!v)}
            />
            Create an interview from this email
          </label>

          {createInterview ? (
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="rv-when">When ({fmt.timeZone})</FieldLabel>
                <Input
                  id="rv-when"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                {x.interview_timezone ? (
                  <FieldDescription>
                    Email says: {x.interview_start} {x.interview_timezone}
                  </FieldDescription>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>Type</FieldLabel>
                <Select
                  items={INTERVIEW_TYPES.map((t) => ({
                    value: t,
                    label: INTERVIEW_TYPE_LABELS[t],
                  }))}
                  value={interviewType}
                  onValueChange={(v) => v && setInterviewType(v as InterviewType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVIEW_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {INTERVIEW_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="rv-platform">Platform</FieldLabel>
                <Input
                  id="rv-platform"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="rv-url">Meeting link</FieldLabel>
                <Input
                  id="rv-url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="rv-interviewer">Interviewer</FieldLabel>
                <Input
                  id="rv-interviewer"
                  value={interviewer}
                  onChange={(e) => setInterviewer(e.target.value)}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="rv-notes">Instructions / notes</FieldLabel>
                <Textarea
                  id="rv-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              <label
                className={cn(
                  "flex items-center gap-2 text-sm sm:col-span-2",
                  !calendarReady && "opacity-60",
                )}
              >
                <Checkbox
                  checked={addToCalendar}
                  disabled={!calendarReady}
                  onCheckedChange={(v) => setAddToCalendar(!!v)}
                />
                <CalendarPlus className="size-4" /> Also create a Google Calendar event
                {!calendarReady ? " (connect Calendar first)" : ""}
              </label>
            </div>
          ) : null}

          <Field>
            <FieldLabel>Update application status</FieldLabel>
            <Select
              items={[
                { value: "__keep__", label: "Keep current status" },
                ...APPLICATION_STATUSES.map((s) => ({
                  value: s,
                  label: APPLICATION_STATUS_LABELS[s],
                })),
              ]}
              value={applyStatus || "__keep__"}
              onValueChange={(v) =>
                setApplyStatus(v === "__keep__" || !v ? "" : String(v))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__keep__">Keep current status</SelectItem>
                {APPLICATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {APPLICATION_STATUS_LABELS[s]}
                    {s === suggested ? (
                      <span className="ml-auto pl-2 text-xs text-muted-foreground">
                        suggested
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={logCommunication}
              onCheckedChange={(v) => setLogCommunication(!!v)}
            />
            Log this email in the application&apos;s communication history
          </label>
        </>
      )}

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !canSubmit}>
          {pending ? "Saving…" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}
