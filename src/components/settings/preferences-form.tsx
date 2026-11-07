"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { updatePreferences } from "@/actions/profile";
import { Controller } from "react-hook-form";

import { NumberField, SelectField } from "@/components/forms/fields";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { TimezonePicker } from "./timezone-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CURRENCIES } from "@/lib/constants";
import type { Profile } from "@/lib/data/profiles";
import { preferencesSchema, type PreferencesInput } from "@/lib/validations/profile";

const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));

export function PreferencesForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { theme, setTheme } = useTheme();

  const form = useForm<PreferencesInput>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      default_currency: (CURRENCIES as readonly string[]).includes(
        profile.default_currency,
      )
        ? (profile.default_currency as PreferencesInput["default_currency"])
        : "USD",
      display_currency: (CURRENCIES as readonly string[]).includes(
        profile.display_currency,
      )
        ? (profile.display_currency as PreferencesInput["display_currency"])
        : "PHP",
      default_timezone: profile.default_timezone,
      default_hours_per_week: profile.default_hours_per_week,
      follow_up_intervals: profile.follow_up_intervals,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const r = await updatePreferences(values);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Preferences saved");
        router.refresh();
      }
    });
  });

  const c = form.control;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Defaults for new applications</CardTitle>
          <CardDescription>
            Pre-filled when you add an application. Each application can override them.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <SelectField
            control={c}
            name="default_currency"
            label="Currency"
            options={currencyOptions}
          />
          <SelectField
            control={c}
            name="display_currency"
            label="Dashboard currency"
            options={currencyOptions}
            description="Income from every job is converted into this currency for the consolidated view."
          />
          <Controller
            control={c}
            name="default_timezone"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="default_timezone">
                  Working time zone <span className="text-destructive">*</span>
                </FieldLabel>
                <TimezonePicker
                  id="default_timezone"
                  value={field.value}
                  onChange={field.onChange}
                />
                <FieldDescription>
                  Dates, interviews and reminders are shown in this zone. Stored in UTC.
                </FieldDescription>
                <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
              </Field>
            )}
          />
          <NumberField
            control={c}
            name="default_hours_per_week"
            label="Weekly hours"
            min={1}
            max={168}
            suffix="h/wk"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Follow-up intervals</CardTitle>
          <CardDescription>
            Used to suggest due dates. Business days skip weekends.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <NumberField
            control={c}
            name="follow_up_intervals.application_days"
            label="After applying"
            min={0}
            max={60}
            step="1"
            suffix="bus. days"
            description="First follow-up."
          />
          <NumberField
            control={c}
            name="follow_up_intervals.second_days"
            label="Next follow-up"
            min={0}
            max={90}
            step="1"
            suffix="days"
            description="After the first one."
          />
          <NumberField
            control={c}
            name="follow_up_intervals.interview_days"
            label="After interview"
            min={0}
            max={30}
            step="1"
            suffix="bus. days"
          />
          <NumberField
            control={c}
            name="follow_up_intervals.assessment_days"
            label="After assessment"
            min={0}
            max={30}
            step="1"
            suffix="bus. days"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel>Theme</FieldLabel>
            <ToggleGroup
              value={[theme ?? "system"]}
              onValueChange={(v) => v[0] && setTheme(String(v[0]))}
              variant="outline"
            >
              <ToggleGroupItem value="light" aria-label="Light">
                <Sun /> Light
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" aria-label="Dark">
                <Moon /> Dark
              </ToggleGroupItem>
              <ToggleGroupItem value="system" aria-label="System">
                <Monitor /> System
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>Saved in this browser.</FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}
