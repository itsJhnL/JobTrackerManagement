import type { ZodError } from "zod";

/**
 * Uniform return type for server actions. Expected failures are returned,
 * not thrown, so the client can show a toast or field errors.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

export function fromZodError<T = never>(error: ZodError): ActionResult<T> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_root";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  const first = error.issues[0];
  const where = first?.path.length ? `${String(first.path[0])}: ` : "";
  return {
    ok: false,
    error: `${where}${first?.message ?? "Invalid input"}`,
    fieldErrors,
  };
}

/** Turns any thrown error into a user-facing ActionResult. */
export function fromUnknownError<T = never>(
  error: unknown,
  fallback = "Something went wrong.",
): ActionResult<T> {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return fail(error.message);
  }
  return fail(fallback);
}
