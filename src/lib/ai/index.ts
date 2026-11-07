import "server-only";

import {
  DEFAULT_GEMINI_FALLBACK_MODEL,
  DEFAULT_GEMINI_MODEL,
  GeminiProvider,
} from "./providers/gemini";
import { AiError, type AiProvider } from "./types";

export type { AiProvider } from "./types";

/** Which provider is configured, for the Settings page and UI hints. Never exposes keys. */
export function aiStatus(): {
  provider: string;
  configured: boolean;
  model: string | null;
  fallbackModel: string | null;
} {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  if (provider === "gemini") {
    return {
      provider,
      configured: !!process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
      fallbackModel: fallbackFromEnv(),
    };
  }
  return { provider, configured: false, model: null, fallbackModel: null };
}

/** GEMINI_FALLBACK_MODEL="none" disables the fallback. */
function fallbackFromEnv(): string | null {
  const v = process.env.GEMINI_FALLBACK_MODEL?.trim();
  if (!v) return DEFAULT_GEMINI_FALLBACK_MODEL;
  return v.toLowerCase() === "none" ? null : v;
}

let cached: AiProvider | null = null;

/**
 * Returns the configured provider. Throws AiError("not_configured") when no key
 * is set so route handlers can respond with a clear 503.
 */
export function getAiProvider(): AiProvider {
  if (cached) return cached;
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();

  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
      throw new AiError(
        "not_configured",
        "AI is not configured. Set GEMINI_API_KEY in the environment.",
        false,
      );
    cached = new GeminiProvider({
      apiKey,
      model: process.env.GEMINI_MODEL,
      fallbackModel: fallbackFromEnv(),
    });
    return cached;
  }

  throw new AiError(
    "not_configured",
    `Unknown AI provider "${provider}". Supported: gemini.`,
    false,
  );
}
