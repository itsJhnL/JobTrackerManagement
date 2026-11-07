import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/activities", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("./client", () => ({ getAccessToken: vi.fn(async () => "token") }));

const DELAY = 50;
let inFlight = 0;
let maxInFlight = 0;
vi.mock("./gmail", () => ({
  listRecentMessages: vi.fn(async () =>
    Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, threadId: `t${i}` })),
  ),
  getMessage: vi.fn(async (_t: string, id: string) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, DELAY));
    inFlight--;
    return {
      id,
      threadId: id,
      snippet: "",
      from: { name: "Recruiter", email: "r@acme.com" },
      subject: "Interview",
      receivedAt: new Date().toISOString(),
      text: "hello",
    };
  }),
}));

import { AiError, type AiProvider } from "@/lib/ai/types";
import type { IntegrationAccountRow } from "@/lib/supabase/database.types";
import type { SupabaseServerClient } from "@/lib/supabase/server";

import { syncGmail } from "./sync";

/** Chainable fake: every query resolves to `{ data, error: null }`. */
function fakeSupabase(inserted: unknown[]) {
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "update"]) q[m] = () => q;
    q.then = (res: (v: unknown) => unknown) => res({ data, error: null });
    return q;
  };
  return {
    from: (table: string) => ({
      ...chain(table === "applications" ? [] : []),
      insert: async (row: unknown) => {
        inserted.push(row);
        return { error: null };
      },
    }),
  } as unknown as SupabaseServerClient;
}

const ai = {
  classifyEmail: vi.fn(async () => ({
    kind: "interview_invite",
    confidence: 0.9,
    company: "Acme",
    job_title: "Dev",
    matched_application_id: null,
    match_confidence: 0,
  })),
} as unknown as AiProvider;

const account = { id: "acc" } as IntegrationAccountRow;

describe("syncGmail", () => {
  beforeEach(() => {
    inFlight = 0;
    maxInFlight = 0;
  });

  it("processes new emails in parallel, a few at a time", async () => {
    const inserted: unknown[] = [];
    const started = Date.now();
    const r = await syncGmail(fakeSupabase(inserted), "u", account, ai, "UTC");
    const elapsed = Date.now() - started;

    expect(r).toMatchObject({ scanned: 12, fresh: 12, stored: 12, remaining: 0 });
    expect(inserted).toHaveLength(12);
    expect(maxInFlight).toBe(4);
    // 12 emails × 50 ms one by one would be ≥ 600 ms; 4 at a time is ~150 ms.
    expect(elapsed).toBeLessThan(450);
  });

  it("stops starting new emails when the time budget runs out", async () => {
    const inserted: unknown[] = [];
    const r = await syncGmail(fakeSupabase(inserted), "u", account, ai, "UTC", {
      budgetMs: DELAY + 10,
    });
    expect(r.stored).toBeGreaterThan(0);
    expect(r.stored + r.remaining).toBe(12);
    expect(r.remaining).toBeGreaterThan(0);
  });

  it("stops early when the AI is overloaded and leaves those emails for next time", async () => {
    let calls = 0;
    const busyAi = {
      classifyEmail: vi.fn(async () => {
        calls++;
        if (calls > 2)
          throw new AiError(
            "provider_error",
            'The model "x" is overloaded right now.',
            true,
          );
        return {
          kind: "interview_invite",
          confidence: 0.9,
          matched_application_id: null,
          match_confidence: 0,
        };
      }),
    } as unknown as AiProvider;
    const inserted: unknown[] = [];
    const r = await syncGmail(fakeSupabase(inserted), "u", account, busyAi, "UTC");
    expect(r.aiUnavailable).toMatch(/overloaded/);
    expect(r.errors).toHaveLength(0);
    expect(r.stored).toBe(2);
    // Workers stop after the first overload instead of trying all 12.
    expect(calls).toBeLessThan(12);
    expect(r.remaining).toBeGreaterThan(0);
  });
});
