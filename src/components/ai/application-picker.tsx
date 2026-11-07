"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/constants";

export interface PickerApplication {
  id: string;
  company_name: string;
  job_title: string;
  status: ApplicationStatus;
}

interface ApplicationPickerProps {
  applications: PickerApplication[];
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  className?: string;
}

export function ApplicationPicker({
  applications,
  value,
  onChange,
  label = "Application",
  className,
}: ApplicationPickerProps) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor="ai-application">{label}</FieldLabel>
      <Select
        items={applications.map((a) => ({
          value: a.id,
          label: `${a.company_name} · ${a.job_title}`,
        }))}
        value={value}
        onValueChange={(v) => onChange(v ? String(v) : null)}
        disabled={applications.length === 0}
      >
        <SelectTrigger id="ai-application" className="w-full">
          <SelectValue
            placeholder={
              applications.length ? "Choose an application" : "No applications yet"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {applications.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="truncate">
                {a.company_name}{" "}
                <span className="text-muted-foreground">· {a.job_title}</span>
              </span>
              <span className="ml-auto pl-2 text-xs text-muted-foreground">
                {APPLICATION_STATUS_LABELS[a.status]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
