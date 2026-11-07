import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ getAccessToken: vi.fn(async () => "token") }));

import type { CalendarEvent } from "./calendar";

let googleEvents: CalendarEvent[] = [];
vi.mock("./calendar", async (orig) => {
  const actual = await orig<typeof import("./calendar")>();
  return { ...actual, listUpcomingEvents: vi.fn(async () => googleEvents) };
});

import type { IntegrationAccountRow } from "@/lib/supabase/database.types";
import type { SupabaseServerClient } from "@/lib/supabase/server";

import { syncCalendar } from "./sync";

// ---------------------------------------------------------------- in-memory Supabase

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeDb(tables: Tables) {
  let seq = 0;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "insert" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    let single = false;
    let returning = false;

    const run = () => {
      if (op === "insert") {
        const inserted = (Array.isArray(payload) ? payload : [payload!]).map((p) => ({
          id: `${table}-${++seq}`,
          outcome: "pending",
          ...p,
        }));
        rows.push(...inserted);
        return { data: single ? inserted[0] : inserted, error: null };
      }
      if (op === "upsert") {
        for (const p of payload as Row[]) {
          const i = rows.findIndex(
            (r) => r.user_id === p.user_id && r.google_event_id === p.google_event_id,
          );
          if (i >= 0) rows[i] = { ...rows[i], ...p };
          else rows.push({ id: `${table}-${++seq}`, ...p });
        }
        return { data: null, error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        matched.forEach((r) => Object.assign(r, payload));
        return { data: returning ? matched : null, error: null };
      }
      const data = matched.map((r) =>
        table === "applications" ? { ...r, contacts: r.contacts ?? [] } : { ...r },
      );
      return { data: single ? (data[0] ?? null) : data, error: null };
    };

    const q = {
      select: () => {
        returning = true;
        return q;
      },
      insert: (p: Row | Row[]) => ((op = "insert"), (payload = p), q),
      update: (p: Row) => ((op = "update"), (payload = p), q),
      upsert: (p: Row[]) => ((op = "upsert"), (payload = p), q),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
      neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), q),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
      single: () => ((single = true), q),
      maybeSingle: () => ((single = true), q),
      then: (resolve: (v: unknown) => unknown) => resolve(run()),
    };
    return q;
  };
  return { from } as unknown as SupabaseServerClient;
}

// ---------------------------------------------------------------- fixtures

const account = { id: "acc", scopes: [] } as unknown as IntegrationAccountRow;
const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
const iso = (d: Date) => d.toISOString();
const plusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "ev-1",
    status: "confirmed",
    summary: "Interview: Bluebird Logistics",
    start: { dateTime: iso(inTwoDays), timeZone: "Asia/Manila" },
    end: { dateTime: iso(plusMinutes(inTwoDays, 45)) },
    hangoutsLink: "https://meet.google.com/abc-defg-hij",
    htmlLink: "https://calendar.google.com/event?eid=1",
    organizer: { email: "talent@bluebird-logistics.com", displayName: "Maria Cruz" },
    attendees: [{ email: "me@gmail.com", self: true }],
    ...over,
  };
}

let tables: Tables;
beforeEach(() => {
  tables = {
    applications: [
      {
        id: "bluebird",
        user_id: "u",
        company_name: "Bluebird Logistics",
        job_title: "CS Associate",
        job_url: null,
        status: "applied",
        archived_at: null,
      },
      {
        id: "globex",
        user_id: "u",
        company_name: "Globex",
        job_title: "Dev",
        job_url: null,
        status: "interview",
        archived_at: null,
      },
    ],
    interviews: [],
    calendar_events: [],
    integration_accounts: [{ id: "acc" }],
    activities: [],
  };
});

const run = () => syncCalendar(fakeDb(tables), "u", account);

describe("syncCalendar interview detection", () => {
  it("creates the interview, links the event and moves the application to Interview", async () => {
    googleEvents = [event()];
    const r = await run();

    expect(r).toMatchObject({ interviewsCreated: 1, interviewsLinked: 0, unmatched: 0 });
    expect(tables.interviews).toHaveLength(1);
    expect(tables.interviews[0]).toMatchObject({
      application_id: "bluebird",
      source: "calendar",
      google_event_id: "ev-1",
      scheduled_at: iso(inTwoDays),
      duration_minutes: 45,
      meeting_url: "https://meet.google.com/abc-defg-hij",
      platform: "Google Meet",
      interviewer: "Maria Cruz",
      timezone: "Asia/Manila",
    });
    expect(tables.calendar_events[0].interview_id).toBe(tables.interviews[0].id);
    expect(tables.applications[0].status).toBe("interview");
  });

  it("is idempotent: a second sync creates no duplicates", async () => {
    googleEvents = [event()];
    await run();
    const r = await run();
    expect(r).toMatchObject({
      interviewsCreated: 0,
      interviewsLinked: 0,
      interviewsUpdated: 0,
    });
    expect(tables.interviews).toHaveLength(1);
    expect(tables.calendar_events).toHaveLength(1);
  });

  it("links an interview already logged by hand instead of duplicating it", async () => {
    tables.interviews.push({
      id: "manual",
      user_id: "u",
      application_id: "bluebird",
      scheduled_at: iso(plusMinutes(inTwoDays, 60)),
      google_event_id: null,
      meeting_url: null,
      duration_minutes: null,
      outcome: "pending",
    });
    googleEvents = [event()];
    const r = await run();
    expect(r).toMatchObject({ interviewsCreated: 0, interviewsLinked: 1 });
    expect(tables.interviews).toHaveLength(1);
    expect(tables.interviews[0]).toMatchObject({
      id: "manual",
      google_event_id: "ev-1",
      scheduled_at: iso(inTwoDays),
      meeting_url: "https://meet.google.com/abc-defg-hij",
    });
  });

  it("follows reschedules, new links and cancellations of a tracked event", async () => {
    googleEvents = [event()];
    await run();

    const moved = plusMinutes(inTwoDays, 24 * 60);
    googleEvents = [
      event({
        start: { dateTime: iso(moved) },
        end: { dateTime: iso(plusMinutes(moved, 30)) },
        hangoutsLink: "https://meet.google.com/new-link-xyz",
      }),
    ];
    let r = await run();
    expect(r.interviewsUpdated).toBe(1);
    expect(tables.interviews[0]).toMatchObject({
      scheduled_at: iso(moved),
      duration_minutes: 30,
      meeting_url: "https://meet.google.com/new-link-xyz",
    });

    googleEvents = [event({ status: "cancelled", start: { dateTime: iso(moved) } })];
    r = await run();
    expect(tables.interviews[0].outcome).toBe("cancelled");
    expect(tables.interviews).toHaveLength(1);
  });

  it("leaves unmatched interviews and personal events alone", async () => {
    googleEvents = [
      event({
        id: "ev-2",
        summary: "Interview with Initech",
        organizer: { email: "hr@initech.io" },
      }),
      event({
        id: "ev-3",
        summary: "Dentist",
        organizer: undefined,
        hangoutsLink: undefined,
      }),
      event({
        id: "ev-4",
        summary: "Globex interview",
        start: { date: "2030-01-01" },
        end: { date: "2030-01-02" },
      }),
    ];
    const r = await run();
    expect(r).toMatchObject({ interviewsCreated: 0, unmatched: 1 });
    expect(tables.interviews).toHaveLength(0);
    expect(tables.calendar_events).toHaveLength(3);
  });

  it("does not move an application that is already past the interview stage", async () => {
    tables.applications[0].status = "offer";
    googleEvents = [event()];
    await run();
    expect(tables.applications[0].status).toBe("offer");
  });
});
