"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createContact, updateContact } from "@/actions/contacts";
import { SelectField, TextField, TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/form-dialog";
import type { ApplicationOption } from "@/components/interviews/interview-form";
import type { ContactRow } from "@/lib/supabase/database.types";
import {
  contactDefaults,
  contactSchema,
  type ContactInput,
} from "@/lib/validations/contact";

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId?: string | null;
  applications?: ApplicationOption[];
  contact?: ContactRow;
  defaultCompany?: string;
}

export function ContactFormDialog(props: ContactFormDialogProps) {
  const editing = !!props.contact;
  return (
    <FormDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={editing ? "Edit contact" : "Add contact"}
      description="Recruiters, hiring managers and referrals."
    >
      <ContactFormInner {...props} />
    </FormDialog>
  );
}

function ContactFormInner({
  onOpenChange,
  applicationId,
  applications,
  contact,
  defaultCompany,
}: ContactFormDialogProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = !!contact;

  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: contact
      ? {
          application_id: contact.application_id,
          name: contact.name,
          role: contact.role ?? "",
          company: contact.company ?? "",
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          linkedin_url: contact.linkedin_url ?? "",
          notes: contact.notes ?? "",
        }
      : { ...contactDefaults(applicationId ?? null), company: defaultCompany ?? "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const r = editing
        ? await updateContact({ id: contact.id, ...values })
        : await createContact(values);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(editing ? "Contact updated" : "Contact added");
      onOpenChange(false);
      router.refresh();
    });
  });

  const c = form.control;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {applications ? (
        <SelectField
          control={c}
          name="application_id"
          label="Application"
          allowEmpty
          emptyLabel="Not linked"
          options={applications.map((a) => ({
            value: a.id,
            label: `${a.company_name} · ${a.job_title}`,
          }))}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={c} name="name" label="Name" required autoComplete="off" />
        <TextField
          control={c}
          name="role"
          label="Role"
          placeholder="Technical Recruiter"
        />
        <TextField control={c} name="company" label="Company" />
        <TextField control={c} name="email" label="Email" type="email" />
        <TextField control={c} name="phone" label="Phone" type="tel" />
        <TextField
          control={c}
          name="linkedin_url"
          label="LinkedIn"
          placeholder="https://linkedin.com/in/…"
        />
      </div>
      <TextareaField control={c} name="notes" label="Notes" rows={2} />
      <FormDialogFooter
        pending={pending}
        submitLabel={editing ? "Save" : "Add"}
        onCancel={() => onOpenChange(false)}
      />
    </form>
  );
}
