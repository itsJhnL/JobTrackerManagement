/**
 * Live integration test against the Gemini API. Opt-in because it spends quota:
 *   RUN_AI_INTEGRATION=1 pnpm test
 * Reads GEMINI_API_KEY / GEMINI_MODEL / GEMINI_FALLBACK_MODEL from .env.local.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { GeminiProvider } from "./gemini";

function loadEnvLocal(): Record<string, string> {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [
          l.slice(0, i).trim(),
          l
            .slice(i + 1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

const env = { ...loadEnvLocal(), ...process.env };
const enabled = process.env.RUN_AI_INTEGRATION === "1" && !!env.GEMINI_API_KEY;

const JOB_POST = `
Senior Frontend Engineer (Remote, Philippines-based)
Acme Analytics is hiring a Senior Frontend Engineer to build our customer dashboard.
Responsibilities: own the React/TypeScript codebase, ship features weekly, mentor two juniors.
Requirements: 5+ years React, TypeScript, testing (Vitest/Playwright). Nice to have: Next.js, Tailwind, Supabase.
Pay: USD 25-35 per hour, 40 hours per week, overlap with US Eastern hours required.
Contract, long-term. Apply by emailing jobs@acme.example with subject "SFE-2026 - Your Name".
Please answer: 1) Describe a performance problem you fixed. 2) What timezone are you in?
Include a link to your portfolio and complete our 2-hour take-home task.
`;

describe.skipIf(!enabled)("GeminiProvider (live)", () => {
  const provider = new GeminiProvider({
    apiKey: env.GEMINI_API_KEY!,
    model: env.GEMINI_MODEL,
    fallbackModel: env.GEMINI_FALLBACK_MODEL,
    timeoutMs: 60_000,
  });

  it("health check reaches a model", async () => {
    const h = await provider.healthCheck();
    expect(h.provider).toBe("gemini");
    expect(h.model).toBeTruthy();
    expect(h.latencyMs).toBeGreaterThan(0);
    console.log(
      `health: ${h.model} in ${h.latencyMs}ms${h.usedFallback ? " (fallback)" : ""}`,
    );
  }, 120_000);

  it("parses a job post into the validated shape", async () => {
    const p = await provider.parseJob(JOB_POST);
    console.log(JSON.stringify(p, null, 2));
    expect(p.company?.toLowerCase()).toContain("acme");
    expect(p.job_title?.toLowerCase()).toContain("frontend");
    expect(p.required_skills.length).toBeGreaterThan(0);
    expect(p.currency).toBe("USD");
    expect(p.rate_type).toBe("hourly");
    expect(p.salary_min).toBe(25);
    expect(p.salary_max).toBe(35);
    expect(p.hours_per_week).toBe(40);
    expect(p.employment_type).toBe("contract");
    expect(p.required_subject_line).toContain("SFE-2026");
    expect(p.screening_questions.length).toBeGreaterThanOrEqual(2);
  }, 180_000);

  it("reports an unavailable model clearly and falls back", async () => {
    const withBadPrimary = new GeminiProvider({
      apiKey: env.GEMINI_API_KEY!,
      model: "gemini-2.5-flash", // 404 for new keys
      fallbackModel: env.GEMINI_FALLBACK_MODEL ?? "gemini-3.5-flash-lite",
      timeoutMs: 60_000,
    });
    const h = await withBadPrimary.healthCheck();
    expect(h.usedFallback).toBe(true);
  }, 120_000);

  it("rejects a bad key with not_configured", async () => {
    const bad = new GeminiProvider({
      apiKey: "invalid-key",
      model: env.GEMINI_MODEL,
      fallbackModel: null,
    });
    await expect(bad.healthCheck()).rejects.toMatchObject({ code: "not_configured" });
  }, 60_000);
});
