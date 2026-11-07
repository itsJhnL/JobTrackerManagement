"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createAssessment, updateAssessment } from "@/actions/assessments";
import {
  DateTimeField,
  SelectField,
  TextField,
  TextareaField,
  toOptions,
} from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/form-dialog";
import { useFormat } from "@/components/timezone-provider";
import type { ApplicationOption } from "@/components/interviews/interview-form";
import { ASSESSMENT_STATUSES, ASSESSMENT_STATUS_LABELS } from "@/lib/constants";
import type { AssessmentRow } from "@/lib/supabase/database.types";
import {
  assessmentDefaults,
  assessmentSchema,
  type AssessmentInput,
} from "@/lib/validations/assessment";

const statusOptions = toOptions(ASSESSMENT_STATUSES, ASSESSMENT_STATUS_LABELS);

interface AssessmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId?: string;
  applications?: ApplicationOption[];
  assessment?: AssessmentRow;
}

export function AssessmentFormDialog(props: AssessmentFormDialogProps) {
  const editing = !!props.assessment;
  return (
    <FormDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={editing ? "Edit assessment" : "Add assessment"}
      description="Tests, take-home tasks and technical assignments."
    >
      <AssessmentFormInner {...props} />
    </FormDialog>
  );
}

function AssessmentFormInner({
  onOpenChange,
  applicationId,
  applications,
  assessment,
}: AssessmentFormDialogProps) {
  const router = useRouter();
  const fmt = useFormat();
  const [pending, start] = useTransition();
  const editing = !!assessment;

  const form = useForm<AssessmentInput>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: assessment
      ? {
          application_id: assessment.application_id,
          title: assessment.title,
          description: assessment.description ?? "",
          deadline: fmt.toInput(assessment.deadline),
          status: assessment.status,
          submission_url: assessment.submission_url ?? "",
          notes: assessment.notes ?? "",
        }
      : assessmentDefaults(applicationId ?? ""),
  });

  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const payload = {
        ...values,
        deadline: values.deadline ? fmt.fromInput(values.deadline) : null,
      };
      const r = editing
        ? await updateAssessment({ id: assessment.id, ...payload })
        : await createAssessment(payload);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(editing ? "Assessment updated" : "Assessment added");
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
      <TextField
        control={c}
        name="title"
        label="Title"
        required
        placeholder="Take-home: build a dashboard"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateTimeField control={c} name="deadline" label="Deadline" />
        <SelectField control={c} name="status" label="Status" options={statusOptions} />
      </div>
      <TextField
        control={c}
        name="submission_url"
        label="Submission link"
        placeholder="https://…"
      />
      <TextareaField control={c} name="description" label="Description" rows={3} />
      <TextareaField control={c} name="notes" label="Notes" rows={2} />
      <FormDialogFooter
        pending={pending}
        submitLabel={editing ? "Save" : "Add"}
        onCancel={() => onOpenChange(false)}
      />
    </form>
  );
}
