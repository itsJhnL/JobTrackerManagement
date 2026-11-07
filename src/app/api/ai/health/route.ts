import { NextResponse } from "next/server";

import { aiStatus, getAiProvider } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { AiError } from "@/lib/ai/types";

/**
 * GET /api/ai/health — verifies the configured AI key, model access and quota
 * with one tiny generation. Requires a session so the endpoint cannot be used
 * to probe the key anonymously. Never returns the key itself.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );

  const status = aiStatus();
  if (!status.configured) {
    return NextResponse.json(
      {
        ok: false,
        code: "not_configured",
        error: "No API key configured. Set GEMINI_API_KEY and restart the server.",
        status,
      },
      { status: 503 },
    );
  }

  try {
    const health = await getAiProvider().healthCheck();
    return NextResponse.json({
      ok: true,
      ...health,
      configuredModel: status.model,
      fallbackModel: status.fallbackModel,
    });
  } catch (e) {
    const err =
      e instanceof AiError
        ? e
        : new AiError(
            "provider_error",
            e instanceof Error ? e.message : "Unknown error",
            true,
          );
    return NextResponse.json(
      {
        ok: false,
        code: err.code,
        error: err.message,
        retryable: err.retryable,
        configuredModel: status.model,
        fallbackModel: status.fallbackModel,
      },
      {
        status:
          err.code === "not_configured" || err.code === "model_unavailable" ? 503 : 502,
      },
    );
  }
}
