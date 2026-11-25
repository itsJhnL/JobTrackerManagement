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
  return { ok: false, error: friendlyDbError(error), fieldErrors };
}

/**
 * A status added in the app before its migration ran fails with a Postgres
 * enum error; say which migration fixes it instead.
 */
function friendlyDbError(message: string) {
  if (/invalid input value for enum application_status: "on_hold"/.test(message))
    return "The “On hold” status isn’t enabled in the database yet. Run supabase/migrations/0004_status_on_hold.sql in the Supabase SQL editor, then try again.";
  return message;
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
