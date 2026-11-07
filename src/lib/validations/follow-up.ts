import { z } from "zod";

import { FOLLOW_UP_STATUSES, FOLLOW_UP_TYPES, PRIORITIES } from "@/lib/constants";

import {
  optionalDate,
  optionalShortText,
  optionalText,
  requiredDate,
  uuid,
} from "./common";

export const followUpSchema = z.object({
  application_id: uuid,
  follow_up_type: z.enum(FOLLOW_UP_TYPES).default("general"),
  title: optionalShortText,
  due_date: requiredDate,
  priority: z.enum(PRIORITIES).default("medium"),
  status: z.enum(FOLLOW_UP_STATUSES).default("pending"),
  last_contact_date: optionalDate,
  notes: optionalText,
  message_draft: optionalText,
});

export type FollowUpInput = z.input<typeof followUpSchema>;
export type FollowUpValues = z.output<typeof followUpSchema>;

export const updateFollowUpSchema = followUpSchema.partial().extend({ id: uuid });

export const completeFollowUpSchema = z.object({
  id: uuid,
  /** Optionally schedule the next one straight away. */
  scheduleNext: z.boolean().default(false),
  note: optionalShortText,
});

export const snoozeFollowUpSchema = z.object({
  id: uuid,
  until: requiredDate,
});

export const followUpDefaults = (applicationId = ""): FollowUpInput => ({
  application_id: applicationId,
  follow_up_type: "general",
  title: "",
  due_date: "",
  priority: "medium",
  status: "pending",
  last_contact_date: "",
  notes: "",
  message_draft: "",
});
