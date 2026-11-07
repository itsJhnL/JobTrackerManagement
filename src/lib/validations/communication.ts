import { z } from "zod";

import { COMMUNICATION_DIRECTIONS, COMMUNICATION_TYPES } from "@/lib/constants";

import { optionalShortText, optionalText, requiredDateTime, uuid } from "./common";

const communicationBase = z.object({
  application_id: uuid,
  contact_id: uuid
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  communication_type: z.enum(COMMUNICATION_TYPES).default("email"),
  direction: z.enum(COMMUNICATION_DIRECTIONS).default("outbound"),
  subject: optionalShortText,
  message: optionalText,
  communication_date: requiredDateTime,
});

/** A logged message must say something: a subject, a body, or both. */
export const communicationSchema = communicationBase.refine(
  (v) => Boolean(v.subject?.trim() || v.message?.trim()),
  { message: "Add a subject or a message", path: ["message"] },
);

export type CommunicationInput = z.input<typeof communicationSchema>;
export type CommunicationValues = z.output<typeof communicationSchema>;

export const updateCommunicationSchema = communicationBase.partial().extend({ id: uuid });

export const communicationDefaults = (applicationId = ""): CommunicationInput => ({
  application_id: applicationId,
  contact_id: null,
  communication_type: "email",
  direction: "outbound",
  subject: "",
  message: "",
  communication_date: new Date().toISOString().slice(0, 16),
});
