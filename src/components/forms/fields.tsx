"use client";

import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Thin React-Hook-Form bindings over shadcn Field primitives so forms stay
 * declarative and consistent. Every field renders label, control, optional
 * description and the validation error.
 */

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  className,
  disabled,
  required,
  type = "text",
  autoComplete,
  inputMode,
}: BaseProps<T> & {
  type?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className={className} data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={field.name}>
            {label}
            {required ? <span className="text-destructive"> *</span> : null}
          </FieldLabel>
          <Input
            id={field.name}
            type={type}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete={autoComplete}
            inputMode={inputMode}
            aria-invalid={fieldState.invalid || undefined}
            {...field}
            value={field.value ?? ""}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
        </Field>
      )}
    />
  );
}

export function NumberField<T extends FieldValues>(
  props: BaseProps<T> & {
    step?: string;
    min?: number;
    max?: number;
    prefix?: string;
    suffix?: string;
  },
) {
  const {
    control,
    name,
    label,
    description,
    placeholder,
    className,
    disabled,
    required,
    step = "any",
    min,
    max,
    prefix,
    suffix,
  } = props;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className={className} data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={field.name}>
            {label}
            {required ? <span className="text-destructive"> *</span> : null}
          </FieldLabel>
          <div className="relative">
            {prefix ? (
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                {prefix}
              </span>
            ) : null}
            <Input
              id={field.name}
              type="number"
              inputMode="decimal"
              step={step}
              min={min}
              max={max}
              placeholder={placeholder}
              disabled={disabled}
              aria-invalid={fieldState.invalid || undefined}
              className={cn("tabular-nums", prefix && "pl-7", suffix && "pr-12")}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={
                field.value === null || field.value === undefined
                  ? ""
                  : String(field.value)
              }
              onChange={(e) => field.onChange(e.target.value)}
            />
            {suffix ? (
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
                {suffix}
              </span>
            ) : null}
          </div>
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
        </Field>
      )}
    />
  );
}

export function DateField<T extends FieldValues>(props: BaseProps<T>) {
  return <TextField {...props} type="date" />;
}

export function DateTimeField<T extends FieldValues>(props: BaseProps<T>) {
  return <TextField {...props} type="datetime-local" />;
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  className,
  disabled,
  required,
  rows = 4,
}: BaseProps<T> & { rows?: number }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className={className} data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={field.name}>
            {label}
            {required ? <span className="text-destructive"> *</span> : null}
          </FieldLabel>
          <Textarea
            id={field.name}
            rows={rows}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={fieldState.invalid || undefined}
            {...field}
            value={field.value ?? ""}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
        </Field>
      )}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder = "Select…",
  className,
  disabled,
  required,
  options,
  allowEmpty,
  emptyLabel = "None",
}: BaseProps<T> & {
  options: readonly SelectOption[];
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const EMPTY = "__none__";
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className={className} data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={field.name}>
            {label}
            {required ? <span className="text-destructive"> *</span> : null}
          </FieldLabel>
          <Select
            items={
              allowEmpty ? [{ value: EMPTY, label: emptyLabel }, ...options] : options
            }
            name={field.name}
            disabled={disabled}
            value={
              field.value === null || field.value === undefined || field.value === ""
                ? allowEmpty
                  ? EMPTY
                  : null
                : String(field.value)
            }
            onValueChange={(v) => field.onChange(v === EMPTY || v === null ? null : v)}
          >
            <SelectTrigger
              id={field.name}
              className="w-full"
              aria-invalid={fieldState.invalid || undefined}
              onBlur={field.onBlur}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {allowEmpty ? (
                <SelectItem value={EMPTY}>
                  <span className="text-muted-foreground">{emptyLabel}</span>
                </SelectItem>
              ) : null}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
        </Field>
      )}
    />
  );
}

export function CheckboxGroupField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  options,
}: Omit<BaseProps<T>, "placeholder"> & { options: readonly SelectOption[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selected: string[] = Array.isArray(field.value) ? field.value : [];
        return (
          <Field className={className} data-invalid={fieldState.invalid || undefined}>
            <FieldLabel>{label}</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => {
                const checked = selected.includes(o.value);
                return (
                  <label
                    key={o.value}
                    className={cn(
                      "flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors select-none",
                      checked
                        ? "border-primary/30 bg-primary/5"
                        : "border-border hover:bg-muted/60",
                    )}
                  >
                    <Checkbox
                      className="size-3.5"
                      checked={checked}
                      onCheckedChange={(v) =>
                        field.onChange(
                          v
                            ? [...selected, o.value]
                            : selected.filter((s) => s !== o.value),
                        )
                      }
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
            {description ? <FieldDescription>{description}</FieldDescription> : null}
            <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
          </Field>
        );
      }}
    />
  );
}

export function toOptions<const V extends string>(
  values: readonly V[],
  labels: Record<V, string>,
): SelectOption[] {
  return values.map((v) => ({ value: v, label: labels[v] }));
}
