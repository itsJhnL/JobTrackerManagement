import { z } from "zod";

import { ASSESSMENT_STATUSES } from "@/lib/constants";

import { optionalDateTime, optionalText, optionalUrl, uuid } from "./common";

export const assessmentSchema = z.object({
  application_id: uuid,
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalText,
  deadline: optionalDateTime,
  status: z.enum(ASSESSMENT_STATUSES).default("not_started"),
  submission_url: optionalUrl,
  notes: optionalText,
});

export type AssessmentInput = z.input<typeof assessmentSchema>;
export type AssessmentValues = z.output<typeof assessmentSchema>;

export const updateAssessmentSchema = assessmentSchema.partial().extend({ id: uuid });

export const assessmentDefaults = (applicationId = ""): AssessmentInput => ({
  application_id: applicationId,
  title: "",
  description: "",
  deadline: "",
  status: "not_started",
  submission_url: "",
  notes: "",
});
