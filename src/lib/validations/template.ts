import { z } from "zod";

import { TEMPLATE_CATEGORIES } from "@/lib/constants";

import { optionalShortText, uuid } from "./common";

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  category: z.enum(TEMPLATE_CATEGORIES).default("general"),
  subject: optionalShortText,
  body: z.string().trim().min(1, "Body is required").max(20000),
});

export type TemplateInput = z.input<typeof templateSchema>;
export type TemplateValues = z.output<typeof templateSchema>;

export const updateTemplateSchema = templateSchema.partial().extend({ id: uuid });

export const templateDefaults: TemplateInput = {
  name: "",
  category: "general",
  subject: "",
  body: "",
};
