import { z } from "zod";

import {
  optionalEmail,
  optionalShortText,
  optionalText,
  optionalUrl,
  uuid,
} from "./common";

export const contactSchema = z.object({
  application_id: uuid
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  name: z.string().trim().min(1, "Name is required").max(200),
  role: optionalShortText,
  company: optionalShortText,
  email: optionalEmail,
  phone: optionalShortText,
  linkedin_url: optionalUrl,
  notes: optionalText,
});

export type ContactInput = z.input<typeof contactSchema>;
export type ContactValues = z.output<typeof contactSchema>;

export const updateContactSchema = contactSchema.partial().extend({ id: uuid });

export const contactDefaults = (applicationId: string | null = null): ContactInput => ({
  application_id: applicationId,
  name: "",
  role: "",
  company: "",
  email: "",
  phone: "",
  linkedin_url: "",
  notes: "",
});
