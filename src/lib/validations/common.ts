import { z } from "zod";

/** Optional free text: trims, turns "" into null. */
export const optionalText = z
  .string()
  .trim()
  .max(10000)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const optionalShortText = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/** Optional URL: accepts "" / null, otherwise must be http(s). */
export const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null)
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), {
    message: "Enter a valid URL starting with http:// or https://",
  });

export const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null)
  .refine((v) => v === null || z.email().safeParse(v).success, {
    message: "Enter a valid email address",
  });

/** Optional non-negative money/number. Accepts number, numeric string, "", null. */
export const optionalNumber = (opts: { min?: number; max?: number } = {}) =>
  z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Enter a number" });
      return z.NEVER;
    }
    if (opts.min !== undefined && n < opts.min) {
      ctx.addIssue({ code: "custom", message: `Must be at least ${opts.min}` });
      return z.NEVER;
    }
    if (opts.max !== undefined && n > opts.max) {
      ctx.addIssue({ code: "custom", message: `Must be at most ${opts.max}` });
      return z.NEVER;
    }
    return n;
  });

/** YYYY-MM-DD or null. */
export const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: "Use the format YYYY-MM-DD",
  });

export const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Pick a date" });

/** ISO datetime string (from datetime-local inputs we normalise to ISO on the client). */
export const requiredDateTime = z
  .string()
  .trim()
  .min(1, { message: "Pick a date and time" })
  .refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: "Enter a valid date and time",
  });

export const optionalDateTime = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null)
  .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), {
    message: "Enter a valid date and time",
  });

export const uuid = z.uuid({ message: "Invalid id" });

export const stringList = z.array(z.string().trim().min(1)).default([]);
