import { z } from "zod";

import { CURRENCIES } from "@/lib/constants";
import { isValidTimezone } from "@/lib/timezone";

import { optionalNumber, optionalShortText, optionalText, optionalUrl } from "./common";

export const experienceEntrySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  company: z.string().trim().max(200).default(""),
  start: z.string().trim().max(40).default(""),
  end: z.string().trim().max(40).default(""),
  highlights: z.array(z.string().trim().min(1)).default([]),
});

export const projectEntrySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).default(""),
  url: z.string().trim().max(500).default(""),
  technologies: z.array(z.string().trim().min(1)).default([]),
});

export const profileSchema = z.object({
  full_name: optionalShortText,
  professional_summary: optionalText,
  skills: z.array(z.string().trim().min(1).max(80)).default([]),
  experience: z.array(experienceEntrySchema).default([]),
  projects: z.array(projectEntrySchema).default([]),
  portfolio_url: optionalUrl,
  resume_url: optionalUrl,
  linkedin_url: optionalUrl,
  github_url: optionalUrl,
});
export type ProfileInput = z.input<typeof profileSchema>;

export const preferencesSchema = z.object({
  default_currency: z.enum(CURRENCIES).default("USD"),
  display_currency: z.enum(CURRENCIES).default("PHP"),
  default_timezone: z
    .string()
    .trim()
    .min(1, "Time zone is required")
    .max(80)
    .refine((v) => isValidTimezone(v), { message: "Choose a valid IANA time zone" }),
  default_hours_per_week: optionalNumber({ min: 1, max: 168 }).transform((v) => v ?? 40),
  follow_up_intervals: z.object({
    application_days: z.coerce.number().int().min(0).max(60),
    second_days: z.coerce.number().int().min(0).max(90),
    interview_days: z.coerce.number().int().min(0).max(30),
    assessment_days: z.coerce.number().int().min(0).max(30),
  }),
});
export type PreferencesInput = z.input<typeof preferencesSchema>;
