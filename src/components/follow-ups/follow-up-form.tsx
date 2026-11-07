"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createFollowUp, updateFollowUp } from "@/actions/follow-ups";
import {
  DateField,
  SelectField,
  TextField,
  TextareaField,
  toOptions,
} from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FOLLOW_UP_TYPES,
  FOLLOW_UP_TYPE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  type FollowUpType,
} from "@/lib/constants";
import { suggestDueDateString } from "@/lib/follow-ups";
import type { FollowUpRow } from "@/lib/supabase/database.types";
import {
  followUpDefaults,
  followUpSchema,
  type FollowUpInput,
} from "@/lib/validations/follow-up";

const typeOptions = toOptions(FOLLOW_UP_TYPES, FOLLOW_UP_TYPE_LABELS);
const priorityOptions = toOptions(PRIORITIES, PRIORITY_LABELS);

interface FollowUpFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  /** Options for the application picker when not scoped to one application. */
  applications?: { id: string; company_name: string; job_title: string }[];
  followUp?: FollowUpRow;
  defaultType?: FollowUpType;
}

export function FollowUpFormDialog(props: FollowUpFormDialogProps) {
  // Remount the inner form on each open so defaults are fresh.
  const [session, setSession] = useState(0);
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => {
        if (o) setSession((n) => n + 1);
        props.onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <FollowUpFormInner key={session} {...props} />
      </DialogContent>
    </Dialog>
  );
}

function FollowUpFormInner({
  onOpenChange,
  applicationId,
  applications,
  followUp,
  defaultType,
}: FollowUpFormDialogProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = !!followUp;

  const form = useForm<FollowUpInput>({
    resolver: zodResolver(followUpSchema),
    defaultValues: followUp
      ? {
          application_id: followUp.application_id,
          follow_up_type: followUp.follow_up_type,
          title: followUp.title ?? "",
          due_date: followUp.due_date,
          priority: followUp.priority,
          status: followUp.status,
          last_contact_date: followUp.last_contact_date ?? "",
          notes: followUp.notes ?? "",
          message_draft: followUp.message_draft ?? "",
        }
      : {
          ...followUpDefaults(applicationId),
          follow_up_type: defaultType ?? "general",
          due_date: suggestDueDateString(defaultType ?? "general", new Date()),
        },
  });

  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const r = editing
        ? await updateFollowUp({ id: followUp.id, ...values })
        : await createFollowUp(values);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(editing ? "Follow-up updated" : "Follow-up scheduled");
      onOpenChange(false);
      router.refresh();
    });
  });

  const c = form.control;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit follow-up" : "Schedule follow-up"}</DialogTitle>
        <DialogDescription>
          Nothing is sent automatically. This is a reminder with an optional draft.
        </DialogDescription>
      </DialogHeader>

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
          name="follow_up_type"
          label="Type"
          options={typeOptions}
        />
        <SelectField
          control={c}
          name="priority"
          label="Priority"
          options={priorityOptions}
        />
        <DateField control={c} name="due_date" label="Due date" required />
        <DateField control={c} name="last_contact_date" label="Last contact" />
      </div>
      <TextField
        control={c}
        name="title"
        label="Title"
        placeholder="Follow up on application"
      />
      <TextareaField
        control={c}
        name="message_draft"
        label="Message draft"
        rows={4}
        placeholder="Draft the message you plan to send."
      />
      <TextareaField control={c} name="notes" label="Notes" rows={2} />

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save" : "Schedule"}
        </Button>
      </DialogFooter>
    </form>
  );
}
