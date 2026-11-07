"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createInterview, updateInterview } from "@/actions/interviews";
import {
  DateTimeField,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
  toOptions,
} from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/form-dialog";
import {
  INTERVIEW_OUTCOMES,
  INTERVIEW_OUTCOME_LABELS,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
} from "@/lib/constants";
import type { InterviewRow } from "@/lib/supabase/database.types";
import {
  interviewDefaults,
  interviewSchema,
  type InterviewInput,
} from "@/lib/validations/interview";

const typeOptions = toOptions(INTERVIEW_TYPES, INTERVIEW_TYPE_LABELS);
const outcomeOptions = toOptions(INTERVIEW_OUTCOMES, INTERVIEW_OUTCOME_LABELS);

export interface ApplicationOption {
  id: string;
  company_name: string;
  job_title: string;
}

interface InterviewFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId?: string;
  applications?: ApplicationOption[];
  interview?: InterviewRow;
  defaultTimezone?: string;
}

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time. */
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function InterviewFormDialog(props: InterviewFormDialogProps) {
  const editing = !!props.interview;
  return (
    <FormDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={editing ? "Edit interview" : "Schedule interview"}
      description="Times are entered in your local time zone; note the employer's zone separately."
    >
      <InterviewFormInner {...props} />
    </FormDialog>
  );
}

function InterviewFormInner({
  onOpenChange,
  applicationId,
  applications,
  interview,
  defaultTimezone,
}: InterviewFormDialogProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = !!interview;

  const form = useForm<InterviewInput>({
    resolver: zodResolver(interviewSchema),
    defaultValues: interview
      ? {
          application_id: interview.application_id,
          title: interview.title ?? "",
          interview_type: interview.interview_type,
          scheduled_at: toLocalInput(interview.scheduled_at),
          duration_minutes: interview.duration_minutes ?? "",
          timezone: interview.timezone ?? "",
          platform: interview.platform ?? "",
          meeting_url: interview.meeting_url ?? "",
          interviewer: interview.interviewer ?? "",
          notes: interview.notes ?? "",
          outcome: interview.outcome,
        }
      : {
          ...interviewDefaults(applicationId ?? ""),
          timezone: defaultTimezone ?? "",
          duration_minutes: 60,
        },
  });

  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const payload = {
        ...values,
        scheduled_at: new Date(values.scheduled_at).toISOString(),
      };
      const r = editing
        ? await updateInterview({ id: interview.id, ...payload })
        : await createInterview(payload);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(editing ? "Interview updated" : "Interview scheduled");
      onOpenChange(false);
      router.refresh();
    });
  });

  const c = form.control;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {applications && !editing ? (
        <SelectField
          control={c}
          name="application_id"
          label="Application"
          required
          options={applications.map((a) => ({
            value: a.id,
            label: `${a.company_name} · ${a.job_title}`,
          }))}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={c}
          name="interview_type"
          label="Type"
          options={typeOptions}
        />
        <TextField
          control={c}
          name="title"
          label="Title"
          placeholder="Technical round with CTO"
        />
        <DateTimeField control={c} name="scheduled_at" label="When" required />
        <NumberField
          control={c}
          name="duration_minutes"
          label="Duration"
          min={0}
          suffix="min"
        />
        <TextField
          control={c}
          name="timezone"
          label="Employer time zone"
          placeholder="America/New_York"
        />
        <TextField
          control={c}
          name="platform"
          label="Platform"
          placeholder="Google Meet, Zoom…"
        />
        <TextField
          control={c}
          name="meeting_url"
          label="Meeting link"
          placeholder="https://…"
          className="sm:col-span-2"
        />
        <TextField
          control={c}
          name="interviewer"
          label="Interviewer"
          placeholder="Name and role"
        />
        <SelectField
          control={c}
          name="outcome"
          label="Outcome"
          options={outcomeOptions}
        />
      </div>
      <TextareaField
        control={c}
        name="notes"
        label="Notes"
        rows={3}
        placeholder="Prep notes, questions asked, impressions."
      />
      <FormDialogFooter
        pending={pending}
        submitLabel={editing ? "Save" : "Schedule"}
        onCancel={() => onOpenChange(false)}
      />
    </form>
  );
}
