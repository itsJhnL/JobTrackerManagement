"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createCommunication, updateCommunication } from "@/actions/communications";
import {
  DateTimeField,
  SelectField,
  TextField,
  TextareaField,
  toOptions,
} from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/form-dialog";
import { COMMUNICATION_TYPES, COMMUNICATION_TYPE_LABELS } from "@/lib/constants";
import type { CommunicationRow, ContactRow } from "@/lib/supabase/database.types";
import {
  communicationDefaults,
  communicationSchema,
  type CommunicationInput,
} from "@/lib/validations/communication";

const typeOptions = toOptions(COMMUNICATION_TYPES, COMMUNICATION_TYPE_LABELS);
const directionOptions = [
  { value: "outbound", label: "I sent this" },
  { value: "inbound", label: "They sent this" },
];

interface CommunicationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  contacts: Pick<ContactRow, "id" | "name" | "role">[];
  communication?: CommunicationRow;
  /** Pre-filled draft, e.g. from a follow-up message draft or AI output. */
  initialMessage?: string;
  initialSubject?: string;
}

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CommunicationFormDialog(props: CommunicationFormDialogProps) {
  const editing = !!props.communication;
  return (
    <FormDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={editing ? "Edit message" : "Log a message"}
      description="Keep a record of what was said. Nothing is sent from here."
    >
      <CommunicationFormInner {...props} />
    </FormDialog>
  );
}

function CommunicationFormInner({
  onOpenChange,
  applicationId,
  contacts,
  communication,
  initialMessage,
  initialSubject,
}: CommunicationFormDialogProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = !!communication;

  const form = useForm<CommunicationInput>({
    resolver: zodResolver(communicationSchema),
    defaultValues: communication
      ? {
          application_id: communication.application_id,
          contact_id: communication.contact_id,
          communication_type: communication.communication_type,
          direction: communication.direction,
          subject: communication.subject ?? "",
          message: communication.message ?? "",
          communication_date: toLocalInput(communication.communication_date),
        }
      : {
          ...communicationDefaults(applicationId),
          communication_date: toLocalInput(new Date().toISOString()),
          message: initialMessage ?? "",
          subject: initialSubject ?? "",
        },
  });

  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const payload = {
        ...values,
        communication_date: new Date(values.communication_date).toISOString(),
      };
      const r = editing
        ? await updateCommunication({ id: communication.id, ...payload })
        : await createCommunication(payload);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(editing ? "Message updated" : "Message logged");
      onOpenChange(false);
      router.refresh();
    });
  });

  const c = form.control;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={c}
          name="direction"
          label="Direction"
          options={directionOptions}
        />
        <SelectField
          control={c}
          name="communication_type"
          label="Channel"
          options={typeOptions}
        />
        <DateTimeField control={c} name="communication_date" label="When" required />
        <SelectField
          control={c}
          name="contact_id"
          label="Contact"
          allowEmpty
          emptyLabel="Unspecified"
          options={contacts.map((ct) => ({
            value: ct.id,
            label: ct.role ? `${ct.name} · ${ct.role}` : ct.name,
          }))}
        />
      </div>
      <TextField control={c} name="subject" label="Subject" />
      <TextareaField control={c} name="message" label="Message" rows={6} />
      <FormDialogFooter
        pending={pending}
        submitLabel={editing ? "Save" : "Log message"}
        onCancel={() => onOpenChange(false)}
      />
    </form>
  );
}
