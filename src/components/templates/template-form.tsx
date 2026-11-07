"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createTemplate, updateTemplate } from "@/actions/templates";
import {
  SelectField,
  TextField,
  TextareaField,
  toOptions,
} from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/form-dialog";
import { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_LABELS } from "@/lib/constants";
import type { TemplateRow } from "@/lib/supabase/database.types";
import {
  templateDefaults,
  templateSchema,
  type TemplateInput,
} from "@/lib/validations/template";

const categoryOptions = toOptions(TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_LABELS);

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateRow;
}

export function TemplateFormDialog(props: TemplateFormDialogProps) {
  const editing = !!props.template;
  return (
    <FormDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={editing ? "Edit template" : "New template"}
      description="Reusable text for cover letters, follow-ups and messages. Use {{company}} and {{job_title}} as placeholders."
    >
      <TemplateFormInner {...props} />
    </FormDialog>
  );
}

function TemplateFormInner({ onOpenChange, template }: TemplateFormDialogProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing = !!template;

  const form = useForm<TemplateInput>({
    resolver: zodResolver(templateSchema),
    defaultValues: template
      ? {
          name: template.name,
          category: (TEMPLATE_CATEGORIES as readonly string[]).includes(template.category)
            ? (template.category as TemplateInput["category"])
            : "general",
          subject: template.subject ?? "",
          body: template.body,
        }
      : templateDefaults,
  });

  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const r = editing
        ? await updateTemplate({ id: template.id, ...values })
        : await createTemplate(values);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(editing ? "Template updated" : "Template saved");
      onOpenChange(false);
      router.refresh();
    });
  });

  const c = form.control;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={c}
          name="name"
          label="Name"
          required
          placeholder="Follow-up after applying"
        />
        <SelectField
          control={c}
          name="category"
          label="Category"
          options={categoryOptions}
        />
      </div>
      <TextField control={c} name="subject" label="Subject" placeholder="Optional" />
      <TextareaField control={c} name="body" label="Body" required rows={10} />
      <FormDialogFooter
        pending={pending}
        submitLabel={editing ? "Save" : "Create"}
        onCancel={() => onOpenChange(false)}
      />
    </form>
  );
}
