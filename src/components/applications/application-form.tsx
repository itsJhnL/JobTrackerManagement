"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createApplication, updateApplication } from "@/actions/applications";
import {
  CheckboxGroupField,
  DateField,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
  toOptions,
} from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  CURRENCIES,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  PAYMENT_FREQUENCIES,
  PAYMENT_FREQUENCY_LABELS,
  PLATFORM_SUGGESTIONS,
  RATE_TYPES,
  RATE_TYPE_LABELS,
  WORKING_DAYS,
  WORKING_DAY_LABELS,
} from "@/lib/constants";
import { estimateCompensation } from "@/lib/compensation";
import { formatMoney } from "@/lib/format";
import type { ApplicationRow } from "@/lib/supabase/database.types";
import {
  applicationDefaults,
  applicationSchema,
  type ApplicationInput,
} from "@/lib/validations/application";

export interface ApplicationFormDefaults {
  currency: string;
  timezone: string;
  hoursPerWeek: number;
}

interface ApplicationFormProps {
  mode: "create" | "edit";
  application?: ApplicationRow;
  defaults: ApplicationFormDefaults;
  /** Pre-filled values (e.g. from AI extraction). */
  initialValues?: Partial<ApplicationInput>;
  onSuccess?: (id: string) => void;
  onCancel?: () => void;
  /** Compact layout for sheets. */
  compact?: boolean;
}

export function applicationToInput(app: ApplicationRow): ApplicationInput {
  const screening = Array.isArray(app.screening_answers)
    ? (app.screening_answers as { question?: unknown; answer?: unknown }[]).map((a) => ({
        question: String(a?.question ?? ""),
        answer: String(a?.answer ?? ""),
      }))
    : [];
  return {
    company_name: app.company_name,
    job_title: app.job_title,
    job_url: app.job_url ?? "",
    platform: app.platform ?? "",
    location: app.location ?? "",
    employment_type: app.employment_type,
    status: app.status,
    job_description: app.job_description ?? "",
    applied_at: app.applied_at ?? "",
    cover_letter: app.cover_letter ?? "",
    screening_answers: screening,
    resume_version: app.resume_version ?? "",
    portfolio_links: app.portfolio_links ?? [],
    application_notes: app.application_notes ?? "",
    offered_rate: app.offered_rate ?? "",
    proposed_rate: app.proposed_rate ?? "",
    negotiated_rate: app.negotiated_rate ?? "",
    minimum_rate: app.minimum_rate ?? "",
    currency: (CURRENCIES as readonly string[]).includes(app.currency)
      ? (app.currency as ApplicationInput["currency"])
      : "USD",
    rate_type: app.rate_type,
    payment_frequency: (PAYMENT_FREQUENCIES as readonly string[]).includes(
      app.payment_frequency ?? "",
    )
      ? (app.payment_frequency as ApplicationInput["payment_frequency"])
      : null,
    hours_per_week: app.hours_per_week ?? "",
    hours_per_day: app.hours_per_day ?? "",
    working_days: (app.working_days ?? []).filter(
      (d): d is (typeof WORKING_DAYS)[number] =>
        (WORKING_DAYS as readonly string[]).includes(d),
    ),
    work_schedule: app.work_schedule ?? "",
    timezone: app.timezone ?? "",
    shift: app.shift ?? "",
    benefits: app.benefits ?? "",
    notes: app.notes ?? "",
    employment_active: app.employment_active,
    employment_started_at: app.employment_started_at ?? "",
    employment_ended_at: app.employment_ended_at ?? "",
  };
}

const statusOptions = toOptions(APPLICATION_STATUSES, APPLICATION_STATUS_LABELS);
const employmentOptions = toOptions(EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS);
const rateTypeOptions = toOptions(RATE_TYPES, RATE_TYPE_LABELS);
const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));
const paymentOptions = toOptions(PAYMENT_FREQUENCIES, PAYMENT_FREQUENCY_LABELS);
const workingDayOptions = toOptions(WORKING_DAYS, WORKING_DAY_LABELS);

export function ApplicationForm({
  mode,
  application,
  defaults,
  initialValues,
  onSuccess,
  onCancel,
  compact,
}: ApplicationFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [linkDraft, setLinkDraft] = useState("");

  const form = useForm<ApplicationInput>({
    resolver: zodResolver(applicationSchema),
    defaultValues: application
      ? applicationToInput(application)
      : {
          ...applicationDefaults,
          currency: (CURRENCIES as readonly string[]).includes(defaults.currency)
            ? (defaults.currency as ApplicationInput["currency"])
            : "USD",
          timezone: defaults.timezone,
          hours_per_week: defaults.hoursPerWeek,
          ...initialValues,
        },
  });

  const screening = useFieldArray({ control: form.control, name: "screening_answers" });
  const watched = useWatch({ control: form.control });
  const links = (watched.portfolio_links ?? []) as string[];

  const preview = estimateCompensation({
    rate:
      toNumber(watched.negotiated_rate) ??
      toNumber(watched.offered_rate) ??
      toNumber(watched.proposed_rate),
    rateType: watched.rate_type ?? "hourly",
    hoursPerWeek: toNumber(watched.hours_per_week),
    hoursPerDay: toNumber(watched.hours_per_day),
    workingDaysPerWeek: watched.working_days?.length ? watched.working_days.length : null,
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result =
        mode === "edit" && application
          ? await updateApplication({ id: application.id, ...values })
          : await createApplication(values);

      if (!result.ok) {
        toast.error(result.error);
        if (result.fieldErrors) {
          for (const [key, messages] of Object.entries(result.fieldErrors)) {
            form.setError(key as keyof ApplicationInput, { message: messages[0] });
          }
        }
        return;
      }

      toast.success(mode === "edit" ? "Application updated" : "Application added");
      if (onSuccess) onSuccess(result.data.id);
      else router.push(`/applications/${result.data.id}`);
    });
  });

  const c = form.control;
  const grid = compact
    ? "grid gap-4 sm:grid-cols-2"
    : "grid gap-4 md:grid-cols-2 lg:grid-cols-3";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Section title="Job" description="Where you applied and what the role is.">
        <div className={grid}>
          <TextField
            control={c}
            name="company_name"
            label="Company"
            required
            placeholder="Acme Inc."
            autoComplete="organization"
          />
          <TextField
            control={c}
            name="job_title"
            label="Job title"
            required
            placeholder="Senior Frontend Engineer"
          />
          <TextField
            control={c}
            name="job_url"
            label="Job URL"
            placeholder="https://…"
            inputMode="url"
          />
          <PlatformField control={c} />
          <TextField
            control={c}
            name="location"
            label="Location"
            placeholder="Remote · Philippines"
          />
          <SelectField
            control={c}
            name="employment_type"
            label="Employment type"
            options={employmentOptions}
            allowEmpty
            emptyLabel="Not specified"
          />
          <SelectField control={c} name="status" label="Status" options={statusOptions} />
          <DateField control={c} name="applied_at" label="Applied on" />
          <TextField
            control={c}
            name="timezone"
            label="Time zone"
            placeholder="America/New_York or EST"
          />
        </div>
        <TextareaField
          control={c}
          name="job_description"
          label="Job description"
          rows={compact ? 5 : 8}
          placeholder="Paste the job post here."
        />
      </Section>

      <Section
        title="Compensation"
        description="Keep rates in the job's own currency. Estimates are labelled as such."
      >
        <div className={grid}>
          <SelectField
            control={c}
            name="currency"
            label="Currency"
            options={currencyOptions}
          />
          <SelectField
            control={c}
            name="rate_type"
            label="Rate type"
            options={rateTypeOptions}
          />
          <SelectField
            control={c}
            name="payment_frequency"
            label="Payment frequency"
            options={paymentOptions}
            allowEmpty
            emptyLabel="Not specified"
          />
          <NumberField
            control={c}
            name="offered_rate"
            label="Employer's offered rate"
            min={0}
            prefix={currencySymbol(watched.currency)}
          />
          <NumberField
            control={c}
            name="proposed_rate"
            label="My proposed rate"
            min={0}
            prefix={currencySymbol(watched.currency)}
          />
          <NumberField
            control={c}
            name="negotiated_rate"
            label="Negotiated rate"
            min={0}
            prefix={currencySymbol(watched.currency)}
          />
          <NumberField
            control={c}
            name="minimum_rate"
            label="Minimum acceptable"
            min={0}
            prefix={currencySymbol(watched.currency)}
            description="Your floor. Never shown to anyone."
          />
          <NumberField
            control={c}
            name="hours_per_week"
            label="Hours per week"
            min={0}
            max={168}
            suffix="h/wk"
          />
          <NumberField
            control={c}
            name="hours_per_day"
            label="Hours per day"
            min={0}
            max={24}
            suffix="h/day"
          />
        </div>
        <CheckboxGroupField
          control={c}
          name="working_days"
          label="Working days"
          options={workingDayOptions}
        />
        <div className={grid}>
          <TextField
            control={c}
            name="work_schedule"
            label="Work schedule"
            placeholder="Mon–Fri, 9am–5pm EST"
          />
          <TextField
            control={c}
            name="shift"
            label="Shift"
            placeholder="Day / Night / Flexible"
          />
        </div>
        <TextareaField
          control={c}
          name="benefits"
          label="Benefits"
          rows={2}
          placeholder="HMO, 13th month, paid leave…"
        />

        <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
          {preview.monthly !== null ? (
            <p>
              <span className="text-muted-foreground">Estimated monthly: </span>
              <span className="font-medium tabular-nums">
                {formatMoney(preview.monthly, watched.currency ?? "USD")}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {formatMoney(preview.annual ?? 0, watched.currency ?? "USD")}/yr ·
                assumes {preview.assumptions.hoursPerWeek}h/wk
                {preview.assumptions.usedDefaults ? " (defaults)" : ""}
              </span>
            </p>
          ) : preview.oneTime !== null ? (
            <p>
              <span className="text-muted-foreground">One-time project amount: </span>
              <span className="font-medium tabular-nums">
                {formatMoney(preview.oneTime, watched.currency ?? "USD")}
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground">Add a rate to see an income estimate.</p>
          )}
        </div>
      </Section>

      {!compact ? (
        <Section title="Application" description="What you submitted.">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              control={c}
              name="resume_version"
              label="Resume version used"
              placeholder="resume-frontend-v3.pdf"
            />
            <Field>
              <FieldLabel htmlFor="portfolio-link">Portfolio links</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="portfolio-link"
                  placeholder="https://…"
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLink();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addLink}>
                  <Plus /> Add
                </Button>
              </div>
              {links.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-1">
                  {links.map((l) => (
                    <li
                      key={l}
                      className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs"
                    >
                      <span className="truncate">{l}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${l}`}
                        onClick={() =>
                          form.setValue(
                            "portfolio_links",
                            links.filter((x) => x !== l),
                            { shouldDirty: true },
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Field>
          </div>
          <TextareaField control={c} name="cover_letter" label="Cover letter" rows={8} />
          <FieldGroup>
            <div className="flex items-center justify-between">
              <FieldLabel>Screening questions</FieldLabel>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => screening.append({ question: "", answer: "" })}
              >
                <Plus /> Add question
              </Button>
            </div>
            {screening.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No screening questions recorded.
              </p>
            ) : null}
            {screening.fields.map((f, i) => (
              <div key={f.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <Input
                    placeholder="Question"
                    {...form.register(`screening_answers.${i}.question`)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove question"
                    onClick={() => screening.remove(i)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Textarea
                  rows={3}
                  placeholder="Your answer"
                  {...form.register(`screening_answers.${i}.answer`)}
                />
              </div>
            ))}
          </FieldGroup>
          <TextareaField
            control={c}
            name="application_notes"
            label="Application notes"
            rows={3}
          />
        </Section>
      ) : null}

      {watched.status === "hired" ? (
        <Section
          title="Employment"
          description="A hired application is an employment record. Only active records count toward estimated income."
        >
          <div className={grid}>
            <Controller
              control={c}
              name="employment_active"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch
                    id="employment_active"
                    checked={!!field.value}
                    onCheckedChange={(v) => field.onChange(!!v)}
                  />
                  <FieldLabel htmlFor="employment_active">Active employment</FieldLabel>
                </Field>
              )}
            />
            <DateField control={c} name="employment_started_at" label="Started on" />
            <DateField
              control={c}
              name="employment_ended_at"
              label="Ended on"
              description="Leave empty while ongoing."
            />
          </div>
        </Section>
      ) : null}

      <Section title="Notes">
        <TextareaField
          control={c}
          name="notes"
          label="Private notes"
          rows={compact ? 3 : 4}
          placeholder="Anything you want to remember about this opportunity."
        />
      </Section>

      <Separator />
      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Add application"}
        </Button>
      </div>
    </form>
  );

  function addLink() {
    const v = linkDraft.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) {
      toast.error("Links must start with http:// or https://");
      return;
    }
    if (!links.includes(v))
      form.setValue("portfolio_links", [...links, v], { shouldDirty: true });
    setLinkDraft("");
  }
}

function PlatformField({
  control,
}: {
  control: Parameters<typeof TextField<ApplicationInput>>[0]["control"];
}) {
  return (
    <>
      <TextField
        control={control}
        name="platform"
        label="Platform"
        placeholder="LinkedIn, Upwork, OnlineJobs.ph…"
      />
      <datalist id="platform-suggestions">
        {PLATFORM_SUGGESTIONS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function toNumber(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const SYMBOLS: Record<string, string> = {
  USD: "$",
  PHP: "₱",
  AUD: "A$",
  CAD: "C$",
  GBP: "£",
  EUR: "€",
  SGD: "S$",
  NZD: "NZ$",
  INR: "₹",
  JPY: "¥",
  AED: "AED",
};
function currencySymbol(c: string | undefined) {
  return (c && SYMBOLS[c]) || c || "$";
}
