import { z } from "zod";

import { COMMUNICATION_DIRECTIONS, COMMUNICATION_TYPES } from "@/lib/constants";

import { optionalShortText, optionalText, requiredDateTime, uuid } from "./common";

export const communicationSchema = z.object({
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

export type CommunicationInput = z.input<typeof communicationSchema>;
export type CommunicationValues = z.output<typeof communicationSchema>;

export const updateCommunicationSchema = communicationSchema
  .partial()
  .extend({ id: uuid });

export const communicationDefaults = (applicationId = ""): CommunicationInput => ({
  application_id: applicationId,
  contact_id: null,
  communication_type: "email",
  direction: "outbound",
  subject: "",
  message: "",
  communication_date: new Date().toISOString().slice(0, 16),
});
