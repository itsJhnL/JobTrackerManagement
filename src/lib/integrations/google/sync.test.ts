import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/activities", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("./client", () => ({ getAccessToken: vi.fn(async () => "token") }));

import type { GmailMessage } from "./gmail";

const DELAY = 50;
let inFlight = 0;
let maxInFlight = 0;
let delay = 0;
/** Gmail as seen by the sync: message list + full messages by id. */
let mailbox: GmailMessage[] = [];

vi.mock("./gmail", () => ({
  listRecentMessages: vi.fn(async () =>
    mailbox.map((m) => ({ id: m.id, threadId: m.threadId })),
  ),
  getMessage: vi.fn(async (_t: string, id: string) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    inFlight--;
    const m = mailbox.find((x) => x.id === id);
    if (!m) throw new Error("Gmail 404");
    return m;
  }),
}));

import { AiError, type AiProvider } from "@/lib/ai/types";
import type { IntegrationAccountRow } from "@/lib/supabase/database.types";
import type { SupabaseServerClient } from "@/lib/supabase/server";

import { bodyText, extractLinks } from "../email-content";
import { syncGmail } from "./sync";

// ------------------------------------------------------------ in-memory db

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Reads a column or a `jsonb->>key` path the way PostgREST does (as text). */
function read(r: Row, key: string): unknown {
  const m = /^(\w+)->>(\w+)$/.exec(key);
  if (!m) return r[key];
  const v = (r[m[1]] as Record<string, unknown> | null)?.[m[2]];
  return v === undefined || v === null ? null : String(v);
}

function fakeDb(tables: Tables) {
  let seq = 0;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "insert" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let single = false;
    let limit = Infinity;

    const run = () => {
      if (op === "insert") {
        const list = Array.isArray(payload) ? payload : [payload!];
        if (table === "email_messages") {
          for (const p of list)
            if (
              rows.some(
                (r) =>
                  r.user_id === p.user_id && r.gmail_message_id === p.gmail_message_id,
              )
            )
              return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const inserted = list.map((p) => ({
          id: `${table}-${++seq}`,
          created_at: new Date(Date.now() + seq).toISOString(),
          archived_at: null,
          ...p,
        }));
        rows.push(...inserted);
        return { data: single ? inserted[0] : inserted, error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        matched.forEach((r) => Object.assign(r, payload));
        return { data: null, error: null };
      }
      if (op === "delete") {
        for (const r of matched) rows.splice(rows.indexOf(r), 1);
        return { data: null, error: null };
      }
      const data = matched
        .slice(0, limit)
        .map((r) =>
          table === "applications" ? { ...r, contacts: r.contacts ?? [] } : { ...r },
        );
      return { data: single ? (data[0] ?? null) : data, error: null };
    };

    const q = {
      select: () => q,
      insert: (p: Row | Row[]) => ((op = "insert"), (payload = p), q),
      update: (p: Row) => ((op = "update"), (payload = p), q),
      delete: () => ((op = "delete"), q),
      eq: (k: string, v: unknown) => (filters.push((r) => read(r, k) === v), q),
      neq: (k: string, v: unknown) => (filters.push((r) => read(r, k) !== v), q),
      is: (k: string, v: unknown) => (filters.push((r) => (read(r, k) ?? null) === v), q),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(read(r, k))), q),
      ilike: (k: string, pattern: string) => {
        const re = new RegExp(
          `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`,
          "i",
        );
        filters.push((r) => re.test(String(read(r, k) ?? "")));
        return q;
      },
      order: () => q,
      limit: (n: number) => ((limit = n), q),
      single: () => ((single = true), q),
      maybeSingle: () => ((single = true), q),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return q;
  };
  return { from } as unknown as SupabaseServerClient;
}

// ---------------------------------------------------------------- fixtures

const account = {
  id: "acc",
  account_email: "me@example.com",
} as unknown as IntegrationAccountRow;

let n = 0;
function mail(over: Partial<GmailMessage>): GmailMessage {
  const id = over.id ?? `m${++n}`;
  return {
    id,
    threadId: id,
    internalDate: String(Date.now()),
    snippet: "",
    headers: {},
    from: { name: "Recruiter", email: "r@acme.com" },
    subject: "Interview",
    receivedAt: "2026-11-09T10:00:00.000Z",
    text: "hello",
    links: [],
    bulk: false,
    ...over,
  };
}

function indeedConfirmation(
  id: string,
  job: { title: string; company: string; key: string },
): GmailMessage {
  const html = `<table><tr><td><p>Application submitted</p></td></tr>
<tr><td><a href="https://apply.indeed.com/indeedapply/confirmemail/viewjob?iaUid=ref${id}&amp;apiToken=SECRET&amp;next=http%3A%2F%2Fph.indeed.com%2Fjob%2Fjob-${job.key}">${job.title}</a></td></tr>
<tr><td>${job.company}</td></tr><tr><td>- Remote</td></tr>
<tr><td><p>The following items were sent to ${job.company}. Good luck!</p></td></tr></table>`;
  return mail({
    id,
    from: { name: "Indeed Apply", email: "indeedapply@indeed.com" },
    subject: `Indeed Application: ${job.title}`,
    text: bodyText("Your application has been submitted. Good luck!", html),
    links: extractLinks(html),
  });
}

const classify = vi.fn(async (input: { subject: string }) => ({
  kind: /interview/i.test(input.subject) ? "interview_invitation" : "not_recruiting",
  confidence: 0.95,
  company: "Acme",
  job_title: "Dev",
  recruiter_name: null,
  recruiter_email: null,
  interview_start: null,
  interview_end: null,
  interview_timezone: null,
  interview_platform: null,
  meeting_url: null,
  instructions: null,
  suggested_status: null,
  summary: "s",
  filter_category: /interview/i.test(input.subject) ? null : "marketing",
  matched_application_id: null,
  match_confidence: 0,
}));
const ai = { classifyEmail: classify } as unknown as AiProvider;

beforeEach(() => {
  inFlight = 0;
  maxInFlight = 0;
  delay = 0;
  mailbox = [];
  classify.mockClear();
});

// ------------------------------------------------------------------ tests

describe("syncGmail: throughput", () => {
  beforeEach(() => {
    delay = DELAY;
    mailbox = Array.from({ length: 12 }, (_, i) =>
      mail({ id: `p${i}`, subject: `Interview ${i}` }),
    );
  });

  it("processes new emails in parallel, a few at a time", async () => {
    const tables: Tables = {};
    const started = Date.now();
    const r = await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    const elapsed = Date.now() - started;
    expect(r).toMatchObject({ scanned: 12, fresh: 12, stored: 12, remaining: 0 });
    expect(tables.email_messages).toHaveLength(12);
    expect(maxInFlight).toBe(4);
    // 12 emails × 50 ms one by one would be ≥ 600 ms; 4 at a time is ~150 ms.
    expect(elapsed).toBeLessThan(450);
  });

  it("stops starting new emails when the time budget runs out", async () => {
    const r = await syncGmail(fakeDb({}), "u", account, ai, "UTC", {
      budgetMs: DELAY + 10,
    });
    expect(r.stored).toBeGreaterThan(0);
    expect(r.stored + r.remaining).toBe(12);
    expect(r.remaining).toBeGreaterThan(0);
  });

  it("stops early when the AI is overloaded and leaves those emails for next time", async () => {
    let calls = 0;
    const busyAi = {
      classifyEmail: vi.fn(async (input: { subject: string }) => {
        calls++;
        if (calls > 2)
          throw new AiError(
            "provider_error",
            'The model "x" is overloaded right now.',
            true,
          );
        return classify(input);
      }),
    } as unknown as AiProvider;
    const r = await syncGmail(fakeDb({}), "u", account, busyAi, "UTC");
    expect(r.aiUnavailable).toMatch(/overloaded/);
    expect(r.errors).toHaveLength(0);
    expect(r.stored).toBe(2);
    // Workers stop after the first overload instead of trying all 12.
    expect(calls).toBeLessThan(12);
    expect(r.remaining).toBeGreaterThan(0);
  });
});

describe("syncGmail: routing", () => {
  it("saves an Indeed confirmation to Applications, not the Inbox, without an AI call", async () => {
    const tables: Tables = {};
    mailbox = [
      indeedConfirmation("i1", {
        title: "AI Automation Engineer (Remote)",
        company: "ChartRequest",
        key: "e42408c2a6590729",
      }),
    ];
    const r = await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    expect(classify).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      savedToApplications: 1,
      applicationsCreated: 1,
      recruiting: 0,
      errors: [],
    });
    const [app] = tables.applications;
    expect(app).toMatchObject({
      company_name: "ChartRequest",
      job_title: "AI Automation Engineer (Remote)",
      status: "applied",
      platform: "Indeed",
      location: "Remote",
      job_url: "https://ph.indeed.com/job/job-e42408c2a6590729",
      applied_at: "2026-11-09T10:00:00.000Z",
    });
    const [email] = tables.email_messages;
    expect(email).toMatchObject({
      classification: "application_confirmation",
      review_status: "confirmed",
      application_id: app.id,
    });
    expect((email.extracted as Row).destination).toBe("applications");
    expect(tables.communications).toHaveLength(1);
  });

  it("never creates a duplicate application for repeated confirmations", async () => {
    const tables: Tables = {};
    const job = {
      title: "Full Stack Developer",
      company: "ODI Technologies",
      key: "aaaabbbbccccdddd",
    };
    mailbox = [indeedConfirmation("d1", job), indeedConfirmation("d2", job)];
    await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    // Same email again (re-sync) and a third copy later.
    mailbox.push(indeedConfirmation("d3", job));
    const r2 = await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    expect(tables.applications).toHaveLength(1);
    expect(tables.email_messages).toHaveLength(3);
    expect(r2.skippedExisting).toBe(2);
    expect(
      tables.email_messages.every(
        (e) =>
          e.application_id === tables.applications[0].id &&
          e.review_status === "confirmed",
      ),
    ).toBe(true);
  });

  it("links a confirmation to an application you already saved and marks it applied", async () => {
    const tables: Tables = {
      applications: [
        {
          id: "app-1",
          user_id: "u",
          company_name: "ChartRequest Inc.",
          job_title: "AI Automation Engineer (remote)",
          status: "saved",
          job_url: null,
          platform: null,
          location: null,
          applied_at: null,
          created_at: "2026-11-01T00:00:00Z",
          archived_at: null,
        },
      ],
    };
    mailbox = [
      indeedConfirmation("s1", {
        title: "AI Automation Engineer (Remote)",
        company: "ChartRequest",
        key: "1111222233334444",
      }),
    ];
    const r = await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    expect(r.applicationsCreated).toBe(0);
    expect(tables.applications).toHaveLength(1);
    expect(tables.applications[0]).toMatchObject({
      status: "applied",
      platform: "Indeed",
      job_url: "https://ph.indeed.com/job/job-1111222233334444",
    });
    expect(tables.email_messages[0].application_id).toBe("app-1");
  });

  it("does not downgrade a later status or overwrite your data", async () => {
    const tables: Tables = {
      applications: [
        {
          id: "app-2",
          user_id: "u",
          company_name: "ChartRequest",
          job_title: "AI Automation Engineer (Remote)",
          status: "interview",
          job_url: "https://chartrequest.example/careers/1",
          platform: "Referral",
          location: null,
          applied_at: "2026-10-01T00:00:00Z",
          created_at: "2026-10-01T00:00:00Z",
          archived_at: null,
        },
      ],
    };
    mailbox = [
      indeedConfirmation("s2", {
        title: "AI Automation Engineer (Remote)",
        company: "ChartRequest",
        key: "5555666677778888",
      }),
    ];
    await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    expect(tables.applications[0]).toMatchObject({
      status: "interview",
      job_url: "https://chartrequest.example/careers/1",
      platform: "Referral",
      applied_at: "2026-10-01T00:00:00Z",
      location: "Remote",
    });
  });

  it("puts an interview invitation from the same company in the Inbox", async () => {
    const tables: Tables = {};
    mailbox = [
      indeedConfirmation("c1", {
        title: "Dev",
        company: "Acme",
        key: "9999888877776666",
      }),
      mail({
        id: "c2",
        subject: "Interview invitation - Dev",
        from: { name: "HR", email: "hr@acme.com" },
      }),
    ];
    const r = await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    expect(r).toMatchObject({ savedToApplications: 1, recruiting: 1 });
    const invite = tables.email_messages.find((e) => e.gmail_message_id === "c2")!;
    expect(invite).toMatchObject({
      classification: "interview_invitation",
      review_status: "pending",
    });
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("filters job alerts without an AI call and stores them", async () => {
    const tables: Tables = {};
    mailbox = [
      mail({
        id: "a1",
        from: { name: "Indeed", email: "donotreply@jobalert.indeed.com" },
        subject: "Front-End Developer at AMAGI. 21 more developer jobs",
      }),
      mail({
        id: "a2",
        from: { name: "Glassdoor", email: "noreply@glassdoor.com" },
        subject:
          "Junior Web Developer at Acme and 6 more jobs in Remote, US for you. Apply Now.",
      }),
    ];
    const r = await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    expect(classify).not.toHaveBeenCalled();
    expect(r.filtered).toBe(2);
    expect(
      tables.email_messages.map((e) => [e.review_status, (e.extracted as Row).category]),
    ).toEqual([
      ["dismissed", "job_alert"],
      ["dismissed", "job_alert"],
    ]);
  });

  it("files AI-detected marketing under Filtered with its category", async () => {
    const tables: Tables = {};
    mailbox = [mail({ id: "k1", subject: "Big sale on courses" })];
    const r = await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    expect(r.filtered).toBe(1);
    expect(tables.email_messages[0]).toMatchObject({
      classification: "not_recruiting",
      review_status: "dismissed",
    });
    expect((tables.email_messages[0].extracted as Row).category).toBe("marketing");
  });

  it("keeps an email the AI calls irrelevant when it comes from a saved contact", async () => {
    const tables: Tables = {
      applications: [
        {
          id: "app-3",
          user_id: "u",
          company_name: "The Mighty Mo",
          job_title: "Developer",
          status: "interview",
          job_url: null,
          contacts: [{ email: "julie@themightymo.com" }],
          created_at: "2026-10-01T00:00:00Z",
          archived_at: null,
        },
      ],
    };
    mailbox = [
      mail({
        id: "t1",
        subject: "Quick note",
        from: { name: "Julie", email: "julie@themightymo.com" },
      }),
    ];
    const r = await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    expect(r.recruiting).toBe(1);
    expect(tables.email_messages[0]).toMatchObject({
      classification: "other_recruiting",
      review_status: "pending",
      application_id: "app-3",
    });
  });
});

describe("syncGmail: stored emails", () => {
  it("re-checks old Inbox rows: Indeed confirmations, own replies, broken subjects", async () => {
    const job = {
      title: "Web Developer",
      company: "Pixel Motion",
      key: "abcdefabcdef0123",
    };
    mailbox = [indeedConfirmation("old-indeed", job)];
    const legacy = (over: Row): Row => ({
      user_id: "u",
      account_id: "acc",
      received_at: "2026-11-07T00:00:00Z",
      review_status: "pending",
      confidence: 0.95,
      extracted: { summary: "x", company: null, job_title: null },
      ...over,
    });
    const tables: Tables = {
      email_messages: [
        legacy({
          id: "e1",
          gmail_message_id: "old-indeed",
          from_email: "indeedapply@indeed.com",
          subject: "Indeed Application: Web Developer",
          classification: "application_confirmation",
        }),
        legacy({
          id: "e2",
          gmail_message_id: "old-own",
          gmail_thread_id: "thread-wingman",
          from_email: "me@example.com",
          subject: "Re: Interview Availability",
          classification: "recruiter_response",
        }),
        // The recruiter's message in the same thread is already in the app.
        legacy({
          id: "e2r",
          gmail_message_id: "old-recruiter",
          gmail_thread_id: "thread-wingman",
          from_email: "waynes@wingman.example",
          subject: "Interview Availability",
          classification: "interview_invitation",
          extracted: { rules_version: 1 },
        }),
        // Your reply in a thread whose recruiter mail was never imported.
        legacy({
          id: "e2x",
          gmail_message_id: "old-own-alone",
          gmail_thread_id: "thread-7ti",
          from_email: "me@example.com",
          subject: "Re: 7TI | Initial Interview Invitation",
          classification: "other_recruiting",
        }),
        legacy({
          id: "e3",
          gmail_message_id: "old-olj",
          from_email: "support@onlinejobs.ph",
          subject: "Bluedog &ndash; Software QA Engineer",
          classification: "recruiter_response",
        }),
        legacy({
          id: "e4",
          gmail_message_id: "manual",
          from_email: "me@example.com",
          subject: "Moved back by me",
          classification: "other_recruiting",
          extracted: { manual_override: "inbox", rules_version: 1 },
        }),
      ],
    };
    const r = await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    const byId = Object.fromEntries(tables.email_messages.map((e) => [e.id, e]));
    expect(byId.e1).toMatchObject({
      review_status: "confirmed",
      application_id: tables.applications[0].id,
    });
    expect(tables.applications[0]).toMatchObject({
      company_name: "Pixel Motion",
      status: "applied",
    });
    expect(byId.e2).toMatchObject({ review_status: "dismissed" });
    expect((byId.e2.extracted as Row).category).toBe("sent_by_you");
    expect(byId.e2x).toMatchObject({ review_status: "pending" });
    expect((byId.e2x.extracted as Row).route_reason).toMatch(/not in the app/);
    expect(byId.e3).toMatchObject({
      review_status: "pending",
      subject: "Bluedog – Software QA Engineer",
    });
    expect(byId.e4).toMatchObject({
      review_status: "pending",
      subject: "Moved back by me",
    });
    expect(r.reprocessed).toBe(4);
    expect(classify).not.toHaveBeenCalled();

    // Second run: nothing left to re-check, nothing duplicated.
    const r2 = await syncGmail(fakeDb(tables), "u", account, ai, "UTC");
    expect(r2.reprocessed).toBe(0);
    expect(tables.applications).toHaveLength(1);
  });

  it("leaves a confirmation in the Inbox when saving it fails, and retries next sync", async () => {
    const tables: Tables = {};
    mailbox = [
      indeedConfirmation("f1", {
        title: "Dev",
        company: "Initech",
        key: "0000111122223333",
      }),
    ];
    const db = fakeDb(tables);
    const failing = {
      from: (t: string) => {
        const q = (db as unknown as { from: (t: string) => Row }).from(t);
        if (t !== "applications") return q;
        return {
          ...q,
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { message: "db down" } }),
            }),
          }),
        };
      },
    } as unknown as SupabaseServerClient;
    const r = await syncGmail(failing, "u", account, ai, "UTC");
    expect(r.savedToApplications).toBe(0);
    expect(r.errors[0]).toMatch(/could not save to Applications: db down/);
    expect(tables.email_messages[0].review_status).toBe("pending");

    const r2 = await syncGmail(db, "u", account, ai, "UTC");
    expect(r2.savedToApplications).toBe(1);
    expect(tables.email_messages[0].review_status).toBe("confirmed");
    expect(tables.applications).toHaveLength(1);
  });
});
