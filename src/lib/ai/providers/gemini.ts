import { ApiError, GoogleGenAI } from "@google/genai";
import type { z } from "zod";

import {
  analyzeFitPrompt,
  classifyEmailPrompt,
  followUpPrompt,
  interviewPrepPrompt,
  parseJobPrompt,
  writePrompt,
} from "../prompts";
import {
  emailAnalysisSchema,
  fitAnalysisSchema,
  followUpDraftSchema,
  interviewPrepSchema,
  parsedJobSchema,
  toJsonSchema,
  writerOutputSchema,
} from "../schemas";
import {
  AiError,
  type AiHealth,
  type AiProvider,
  type ApplicationContext,
  type EmailInput,
  type ProfileContext,
  type WriterKind,
} from "../types";

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  /** Used when the primary model is overloaded, rate limited, or unavailable. */
  fallbackModel?: string | null;
  /** Soft timeout in ms for one generation attempt. */
  timeoutMs?: number;
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite";

/**
 * Google Gemini implementation of AiProvider using structured JSON output.
 * Server-side only: never import this from a client component.
 *
 * Resilience: a transient failure (503 overloaded, 429 rate limit, timeout)
 * is retried once after a short backoff, then the fallback model is tried.
 * A model that is unavailable to this key (404) goes straight to the fallback.
 */
export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;
  private model: string;
  private fallbackModel: string | null;
  private timeoutMs: number;

  constructor(opts: GeminiProviderOptions) {
    this.client = new GoogleGenAI({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_GEMINI_MODEL;
    this.fallbackModel =
      opts.fallbackModel === undefined
        ? DEFAULT_GEMINI_FALLBACK_MODEL
        : opts.fallbackModel;
    if (this.fallbackModel === this.model) this.fallbackModel = null;
    this.timeoutMs = opts.timeoutMs ?? 45_000;
  }

  private async callModel(
    model: string,
    prompt: { system?: string; user: string },
    schema?: z.ZodType,
  ) {
    const response = await this.client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt.user }] }],
      config: {
        systemInstruction: prompt.system,
        responseMimeType: "application/json",
        responseJsonSchema: schema ? toJsonSchema(schema) : undefined,
        temperature: 0.4,
        abortSignal: AbortSignal.timeout(this.timeoutMs),
      },
    });
    return response.text;
  }

  /**
   * Runs a prompt against the primary model with one retry on transient
   * errors, then the fallback model. Returns the raw text and the model used.
   */
  private async generateText(
    prompt: { system?: string; user: string },
    schema?: z.ZodType,
  ) {
    const plan: { model: string; attempt: number }[] = [
      { model: this.model, attempt: 1 },
      { model: this.model, attempt: 2 },
    ];
    if (this.fallbackModel) plan.push({ model: this.fallbackModel, attempt: 1 });

    let lastError: AiError | null = null;
    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      try {
        const text = await this.callModel(step.model, prompt, schema);
        return { text, model: step.model };
      } catch (e) {
        const err = mapGeminiError(e, step.model);
        lastError = err;
        if (!err.retryable) {
          // Model unavailable to this key: skip straight to the fallback model.
          if (
            err.code === "model_unavailable" &&
            this.fallbackModel &&
            step.model !== this.fallbackModel
          ) {
            i = plan.findIndex((p) => p.model === this.fallbackModel) - 1;
            continue;
          }
          throw err;
        }
        if (i < plan.length - 1) await sleep(step.attempt === 1 ? 1500 : 500);
      }
    }
    throw lastError ?? new AiError("provider_error", "AI provider error.", true);
  }

  private async generate<T extends z.ZodType>(
    prompt: { system: string; user: string },
    schema: T,
  ): Promise<z.output<T>> {
    const { text } = await this.generateText(prompt, schema);

    if (!text)
      throw new AiError(
        "invalid_response",
        "The model returned an empty response.",
        true,
      );

    let json: unknown;
    try {
      json = JSON.parse(stripFences(text));
    } catch {
      throw new AiError("invalid_response", "The model returned malformed JSON.", true);
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new AiError(
        "invalid_response",
        "The model response did not match the expected shape.",
        true,
      );
    }
    return parsed.data;
  }

  /** Cheap round-trip to verify the key, model access and quota. */
  async healthCheck(): Promise<AiHealth> {
    const started = Date.now();
    const { text, model } = await this.generateText({
      user: 'Reply with exactly this JSON: {"ok":true}',
    });
    let ok = false;
    try {
      ok = (JSON.parse(stripFences(text ?? "")) as { ok?: unknown }).ok === true;
    } catch {
      ok = false;
    }
    if (!ok)
      throw new AiError(
        "invalid_response",
        "The model answered, but not in the expected format.",
        true,
      );
    return {
      provider: this.name,
      model,
      usedFallback: model !== this.model,
      latencyMs: Date.now() - started,
    };
  }

  classifyEmail(email: EmailInput) {
    return this.generate(classifyEmailPrompt(email), emailAnalysisSchema);
  }

  parseJob(jobText: string) {
    return this.generate(parseJobPrompt(jobText), parsedJobSchema);
  }

  analyzeFit(jobText: string, profile: ProfileContext) {
    return this.generate(analyzeFitPrompt(jobText, profile), fitAnalysisSchema);
  }

  write(
    kind: WriterKind,
    app: ApplicationContext,
    profile: ProfileContext,
    extra: { question?: string; tone?: string; instructions?: string },
  ) {
    return this.generate(writePrompt(kind, app, profile, extra), writerOutputSchema);
  }

  draftFollowUp(
    app: ApplicationContext,
    extra: { tone?: string; instructions?: string },
  ) {
    return this.generate(followUpPrompt(app, extra), followUpDraftSchema);
  }

  prepareInterview(app: ApplicationContext, profile: ProfileContext) {
    return this.generate(interviewPrepPrompt(app, profile), interviewPrepSchema);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripFences(text: string) {
  return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
}

function mapGeminiError(e: unknown, model: string): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof ApiError) {
    if (e.status === 429) {
      const quota = /quota|exceeded|billing/i.test(e.message);
      return new AiError(
        quota ? "quota_exceeded" : "rate_limited",
        quota
          ? "The free Gemini quota has been exhausted for now. Try again later or add billing."
          : "Too many requests to the AI provider. Wait a moment and retry.",
        true,
      );
    }
    // Gemini answers an invalid key with 400 API_KEY_INVALID, not 401.
    if (
      e.status === 401 ||
      e.status === 403 ||
      /API key not valid|API_KEY_INVALID/i.test(e.message)
    )
      return new AiError(
        "not_configured",
        "The Gemini API key was rejected. Check GEMINI_API_KEY.",
        false,
      );
    if (e.status === 404)
      return new AiError(
        "model_unavailable",
        `The model "${model}" is not available to this API key. Set GEMINI_MODEL to a current model (for example ${DEFAULT_GEMINI_MODEL}).`,
        false,
      );
    if (e.status === 400)
      return new AiError("bad_request", "The AI provider rejected the request.", false);
    if (e.status === 503 || /high demand|overloaded/i.test(e.message))
      return new AiError(
        "provider_error",
        `The model "${model}" is overloaded right now. Try again shortly.`,
        true,
      );
    if (e.status >= 500)
      return new AiError(
        "provider_error",
        "The AI provider is having trouble. Try again shortly.",
        true,
      );
    return new AiError("provider_error", e.message || "AI provider error.", true);
  }
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return new AiError("provider_error", "The AI request timed out. Try again.", true);
  }
  return new AiError(
    "provider_error",
    e instanceof Error ? e.message : "Unknown AI provider error.",
    true,
  );
}
