import { z } from "zod";

import { INTERVIEW_OUTCOMES, INTERVIEW_TYPES } from "@/lib/constants";

import {
  optionalNumber,
  optionalShortText,
  optionalText,
  optionalUrl,
  requiredDateTime,
  uuid,
} from "./common";

export const interviewSchema = z.object({
  application_id: uuid,
  title: optionalShortText,
  interview_type: z.enum(INTERVIEW_TYPES).default("video"),
  scheduled_at: requiredDateTime,
  duration_minutes: optionalNumber({ min: 0, max: 1440 }),
  timezone: optionalShortText,
  platform: optionalShortText,
  meeting_url: optionalUrl,
  interviewer: optionalShortText,
  notes: optionalText,
  outcome: z.enum(INTERVIEW_OUTCOMES).default("pending"),
});

export type InterviewInput = z.input<typeof interviewSchema>;
export type InterviewValues = z.output<typeof interviewSchema>;

export const updateInterviewSchema = interviewSchema.partial().extend({ id: uuid });

export const interviewDefaults = (applicationId = ""): InterviewInput => ({
  application_id: applicationId,
  title: "",
  interview_type: "video",
  scheduled_at: "",
  duration_minutes: "",
  timezone: "",
  platform: "",
  meeting_url: "",
  interviewer: "",
  notes: "",
  outcome: "pending",
});

/** Track a calendar event as an interview: link to an application, or create one. */
export const trackCalendarEventSchema = z
  .object({
    calendar_event_id: uuid,
    application_id: uuid.optional(),
    new_application: z
      .object({
        company_name: z.string().trim().min(1, "Enter the company").max(200),
        job_title: z.string().trim().min(1, "Enter the job title").max(200),
      })
      .optional(),
    interview_type: z.enum(INTERVIEW_TYPES).default("video"),
  })
  .refine((v) => !!v.application_id !== !!v.new_application, {
    message: "Choose an application or enter a new one",
    path: ["application_id"],
  });
export type TrackCalendarEventInput = z.input<typeof trackCalendarEventSchema>;
