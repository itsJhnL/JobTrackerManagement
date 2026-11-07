import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

import { getAiProvider } from "./index";
import { AiError, type AiErrorCode, type AiProvider } from "./types";

const STATUS: Record<AiErrorCode, number> = {
  not_configured: 503,
  quota_exceeded: 429,
  rate_limited: 429,
  invalid_response: 502,
  provider_error: 502,
  unauthorized: 401,
  bad_request: 400,
  model_unavailable: 503,
};

export interface AiRouteContext {
  user: User;
  supabase: SupabaseServerClient;
  ai: AiProvider;
}

/**
 * Wraps an AI route handler: requires a session, validates the JSON body with
 * the given schema, resolves the provider, and maps AiError to HTTP responses
 * of the shape { data } | { error, code, retryable }.
 */
export function aiRoute<TSchema extends z.ZodType, TResult>(
  schema: TSchema,
  run: (input: z.output<TSchema>, ctx: AiRouteContext) => Promise<TResult>,
) {
  return async function POST(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user)
      return fail(new AiError("unauthorized", "Sign in to use the AI assistant.", false));

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail(new AiError("bad_request", "Request body must be JSON.", false));
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail(
        new AiError(
          "bad_request",
          parsed.error.issues[0]?.message ?? "Invalid request.",
          false,
        ),
      );
    }

    try {
      const ai = getAiProvider();
      const supabase = await createClient();
      const data = await run(parsed.data, { user, supabase, ai });
      return NextResponse.json({ data });
    } catch (e) {
      if (e instanceof AiError) return fail(e);
      console.error("[ai] unexpected error", e);
      return fail(
        new AiError(
          "provider_error",
          "Something went wrong while talking to the AI provider.",
          true,
        ),
      );
    }
  };
}

function fail(error: AiError) {
  return NextResponse.json(
    { error: error.message, code: error.code, retryable: error.retryable },
    { status: STATUS[error.code] },
  );
}
