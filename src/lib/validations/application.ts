import { z } from "zod";

import {
  APPLICATION_STATUSES,
  CURRENCIES,
  EMPLOYMENT_TYPES,
  PAYMENT_FREQUENCIES,
  RATE_TYPES,
  WORKING_DAYS,
} from "@/lib/constants";

import {
  optionalDate,
  optionalNumber,
  optionalShortText,
  optionalText,
  optionalUrl,
  stringList,
  uuid,
} from "./common";

export const screeningAnswerSchema = z.object({
  question: z.string().trim().min(1, "Question is required").max(2000),
  answer: z.string().trim().max(10000).default(""),
});
export type ScreeningAnswer = z.infer<typeof screeningAnswerSchema>;

/** Full application form (create + edit). Shared by the form and the server action. */
export const applicationSchema = z.object({
  company_name: z.string().trim().min(1, "Company is required").max(200),
  job_title: z.string().trim().min(1, "Job title is required").max(200),
  job_url: optionalUrl,
  platform: optionalShortText,
  location: optionalShortText,
  employment_type: z
    .enum(EMPLOYMENT_TYPES)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  status: z.enum(APPLICATION_STATUSES).default("saved"),
  job_description: optionalText,
  applied_at: optionalDate,

  // Application tab
  cover_letter: optionalText,
  screening_answers: z.array(screeningAnswerSchema).default([]),
  resume_version: optionalShortText,
  portfolio_links: stringList,
  application_notes: optionalText,

  // Compensation tab
  offered_rate: optionalNumber({ min: 0 }),
  proposed_rate: optionalNumber({ min: 0 }),
  negotiated_rate: optionalNumber({ min: 0 }),
  minimum_rate: optionalNumber({ min: 0 }),
  currency: z.enum(CURRENCIES).default("USD"),
  rate_type: z.enum(RATE_TYPES).default("hourly"),
  payment_frequency: z
    .enum(PAYMENT_FREQUENCIES)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  hours_per_week: optionalNumber({ min: 0, max: 168 }),
  hours_per_day: optionalNumber({ min: 0, max: 24 }),
  working_days: z.array(z.enum(WORKING_DAYS)).default([]),
  work_schedule: optionalShortText,
  timezone: optionalShortText,
  shift: optionalShortText,
  benefits: optionalText,

  notes: optionalText,

  // Employment record (meaningful once status = hired)
  employment_active: z.boolean().default(true),
  employment_started_at: optionalDate,
  employment_ended_at: optionalDate,
});

export type ApplicationInput = z.input<typeof applicationSchema>;
export type ApplicationValues = z.output<typeof applicationSchema>;

/** Minimal quick-add form. */
export const quickApplicationSchema = applicationSchema.pick({
  company_name: true,
  job_title: true,
  job_url: true,
  platform: true,
  location: true,
  employment_type: true,
  status: true,
  applied_at: true,
  offered_rate: true,
  proposed_rate: true,
  currency: true,
  rate_type: true,
  hours_per_week: true,
  job_description: true,
  timezone: true,
  notes: true,
});
export type QuickApplicationInput = z.input<typeof quickApplicationSchema>;

export const updateApplicationSchema = applicationSchema.partial().extend({ id: uuid });

export const updateStatusSchema = z.object({
  id: uuid,
  status: z.enum(APPLICATION_STATUSES),
  note: optionalShortText,
});

export const bulkIdsSchema = z.object({
  ids: z.array(uuid).min(1, "Select at least one application"),
});

export const bulkStatusSchema = bulkIdsSchema.extend({
  status: z.enum(APPLICATION_STATUSES),
});

export const applicationDefaults: ApplicationInput = {
  company_name: "",
  job_title: "",
  job_url: "",
  platform: "",
  location: "",
  employment_type: null,
  status: "saved",
  job_description: "",
  applied_at: "",
  cover_letter: "",
  screening_answers: [],
  resume_version: "",
  portfolio_links: [],
  application_notes: "",
  offered_rate: "",
  proposed_rate: "",
  negotiated_rate: "",
  minimum_rate: "",
  currency: "USD",
  rate_type: "hourly",
  payment_frequency: null,
  hours_per_week: "",
  hours_per_day: "",
  working_days: [],
  work_schedule: "",
  timezone: "",
  shift: "",
  benefits: "",
  notes: "",
  employment_active: true,
  employment_started_at: "",
  employment_ended_at: "",
};
