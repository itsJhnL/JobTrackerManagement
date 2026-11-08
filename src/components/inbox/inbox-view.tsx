"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, Check, CheckCheck, Inbox, Mail, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { ButtonLink } from "@/components/shared/button-link";
import { confirmEmail, dismissEmail, markEmailsRead } from "@/actions/integrations";
import { TimeAgo } from "@/components/shared/time-ago";
import {
  startGoogleSync,
  useGoogleSyncStatus,
} from "@/components/integrations/google-sync";
import { StatusBadge } from "@/components/applications/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormat } from "@/components/timezone-provider";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  type ApplicationStatus,
  type InterviewType,
} from "@/lib/constants";
import type { EmailAnalysis } from "@/lib/ai/types";
import type { EmailMessageWithApplication } from "@/lib/data/integrations";
import { isEmailUnread } from "@/lib/inbox";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  application_confirmation: "Application received",
  recruiter_response: "Recruiter response",
  interview_invitation: "Interview invitation",
  interview_reschedule: "Interview rescheduled",
  job_offer: "Job offer",
  rejection: "Rejection",
  other_recruiting: "Recruiting",
};

const KIND_STYLES: Record<string, string> = {
  interview_invitation: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  interview_reschedule: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  job_offer: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejection: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  recruiter_response: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  application_confirmation: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  other_recruiting: "bg-muted text-muted-foreground",
};

interface InboxViewProps {
  emails: EmailMessageWithApplication[];
  applications: {
    id: string;
    company_name: string;
    job_title: string;
    status: ApplicationStatus;
  }[];
  gmailReady: boolean;
  lastGmailSyncAt: string | null;
  calendarReady: boolean;
}

export function InboxView({
  emails,
  applications,
  gmailReady,
  calendarReady,
  lastGmailSyncAt,
}: InboxViewProps) {
  const router = useRouter();
  const fmt = useFormat();
  const [pending, start] = useTransition();
  const [review, setReview] = useState<EmailMessageWithApplication | null>(null);

  const groups = {
    pending: emails.filter((e) => e.review_status === "pending"),
    confirmed: emails.filter((e) => e.review_status === "confirmed"),
    dismissed: emails.filter((e) => e.review_status === "dismissed"),
  };

  const syncing = useGoogleSyncStatus().gmail;
  // Emails opened in this session show as read immediately; the server catches up.
  const [readLocally, setReadLocally] = useState<Set<string>>(() => new Set());
  const unread = (e: EmailMessageWithApplication) =>
    isEmailUnread(e) && !readLocally.has(e.id);
  const unreadCount = groups.pending.filter(unread).length;

  const markRead = (ids?: string[]) => {
    setReadLocally((prev) => {
      const next = new Set(prev);
      (ids ?? groups.pending.map((e) => e.id)).forEach((id) => next.add(id));
      return next;
    });
    void markEmailsRead(ids).then((r) => {
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  };

  const openReview = (e: EmailMessageWithApplication) => {
    setReview(e);
    if (unread(e)) markRead([e.id]);
  };
  const sync = () => startGoogleSync("gmail", () => router.refresh());

  const dismiss = (id: string) =>
    start(async () => {
      const r = await dismissEmail(id);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {gmailReady
            ? `${groups.pending.length} awaiting your review${unreadCount ? `, ${unreadCount} unread` : ""}. Nothing is linked or scheduled until you confirm.`
            : "Connect Gmail in Settings → Integrations to detect recruiting emails automatically."}
        </p>
        {gmailReady ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Auto-sync on · last synced{" "}
              {lastGmailSyncAt ? <TimeAgo value={lastGmailSyncAt} /> : "never"}
            </span>
            {unreadCount > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => markRead()}>
                <CheckCheck /> Mark all as read
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
              <RefreshCw className={cn(syncing && "animate-spin")} />{" "}
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        ) : (
          <ButtonLink href="/settings?tab=integrations" size="sm">
            Connect Gmail
          </ButtonLink>
        )}
      </div>

      <Tabs defaultValue="pending" className="gap-4">
        <TabsList variant="line" className="h-9 w-max gap-2 border-b pb-0">
          {(["pending", "confirmed", "dismissed"] as const).map((k) => (
            <TabsTrigger key={k} value={k} className="h-8 px-2 pb-2.5 capitalize">
              {k === "pending" ? "To review" : k}
              <span className="ml-1 rounded-sm bg-muted px-1 text-[10px] text-muted-foreground tabular-nums">
                {groups[k].length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {(["pending", "confirmed", "dismissed"] as const).map((k) => (
          <TabsContent key={k} value={k}>
            {groups[k].length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={k === "pending" ? "Nothing to review" : `No ${k} emails`}
                description={
                  k === "pending"
                    ? "Detected recruiting emails will appear here."
                    : undefined
                }
              />
            ) : (
              <ul className="flex flex-col divide-y rounded-xl border">
                {groups[k].map((e) => {
                  const x = e.extracted as Partial<EmailAnalysis> | null;
                  const isUnread = unread(e);
                  return (
                    <li
                      key={e.id}
                      data-unread={isUnread || undefined}
                      className="flex flex-col gap-2 px-4 py-3 data-unread:bg-primary/[0.03] sm:flex-row sm:items-start"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "border-transparent",
                              KIND_STYLES[e.classification ?? "other_recruiting"],
                            )}
                          >
                            {KIND_LABELS[e.classification ?? "other_recruiting"] ??
                              e.classification}
                          </Badge>
                          {isUnread ? (
                            <span
                              className="size-2 shrink-0 rounded-full bg-primary"
                              aria-label="Unread"
                            />
                          ) : null}
                          <span
                            className={cn(
                              "truncate",
                              isUnread ? "font-semibold" : "font-medium",
                            )}
                          >
                            {e.subject}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {e.from_name ?? e.from_email} · {fmt.dateTime(e.received_at)}
                          {e.confidence !== null
                            ? ` · ${Math.round(e.confidence * 100)}% sure`
                            : ""}
                        </p>
                        {x?.summary ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {x.summary}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs">
                          {e.application ? (
                            <Link
                              href={`/applications/${e.application.id}`}
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              <Mail className="size-3" /> {e.application.company_name} ·{" "}
                              {e.application.job_title}{" "}
                              <StatusBadge status={e.application.status} />
                            </Link>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-300">
                              Not matched to an application yet
                            </span>
                          )}
                        </p>
                        {x?.interview_start ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Proposed: {fmt.dateTime(x.interview_start)}
                            {x.interview_platform ? ` · ${x.interview_platform}` : ""}
                          </p>
                        ) : null}
                      </div>
                      {k === "pending" ? (
                        <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
                          <Button
                            size="sm"
                            onClick={() => openReview(e)}
                            disabled={pending}
                          >
                            <Check /> Review
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => dismiss(e.id)}
                            disabled={pending}
                            aria-label="Dismiss"
                          >
                            <X />
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <FormDialog
        open={!!review}
        onOpenChange={(o) => !o && setReview(null)}
        title="Review detected email"
        description="Check what was extracted, pick the application, and decide what to save. Nothing is sent to the sender."
        className="sm:max-w-xl"
      >
        {review ? (
          <ReviewForm
            email={review}
            applications={applications}
            calendarReady={calendarReady}
            onDone={() => setReview(null)}
          />
        ) : null}
      </FormDialog>
    </>
  );
}

function ReviewForm({
  email,
  applications,
  calendarReady,
  onDone,
}: {
  email: EmailMessageWithApplication;
  applications: InboxViewProps["applications"];
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
    email.application_id ?? x.alternatives?.[0]?.id ?? "",
  );
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
        application_id: applicationId,
        create_interview: createInterview,
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
        toast.success(createInterview ? "Interview saved" : "Email linked");
        onDone();
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">{email.subject}</p>
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
          items={applications.map((a) => ({
            value: a.id,
            label: `${a.company_name} · ${a.job_title}`,
          }))}
          value={applicationId || null}
          onValueChange={(v) => setApplicationId(v ? String(v) : "")}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose the application this email belongs to" />
          </SelectTrigger>
          <SelectContent>
            {applications.map((a) => (
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
        {!email.application_id ? (
          <FieldDescription>
            We could not match this confidently
            {x.company ? ` (the email mentions ${x.company})` : ""}. Please confirm.
          </FieldDescription>
        ) : null}
      </Field>

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
          onValueChange={(v) => setApplyStatus(v === "__keep__" || !v ? "" : String(v))}
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

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !applicationId}>
          {pending ? "Saving…" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}
