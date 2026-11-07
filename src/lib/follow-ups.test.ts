import { describe, expect, it } from "vitest";

import {
  bucketFollowUp,
  daysFromDue,
  parseIntervals,
  suggestDueDateString,
} from "./follow-ups";

// Wednesday 2026-11-04
const WED = new Date(2026, 10, 4, 12, 0, 0);

describe("suggestDueDate", () => {
  it("initial application: 3 business days (skips weekend)", () => {
    // Wed + 3 business days = Mon
    expect(suggestDueDateString("initial_application", WED)).toBe("2026-11-09");
  });

  it("second application follow-up: 7 calendar days", () => {
    expect(
      suggestDueDateString("initial_application", WED, undefined, { previousCount: 1 }),
    ).toBe("2026-11-11");
  });

  it("interview: 2 business days by default", () => {
    expect(suggestDueDateString("interview", WED)).toBe("2026-11-06");
  });

  it("assessment: 3 business days by default", () => {
    expect(suggestDueDateString("assessment", WED)).toBe("2026-11-09");
  });

  it("honours custom intervals", () => {
    const intervals = {
      application_days: 1,
      second_days: 2,
      interview_days: 1,
      assessment_days: 1,
    };
    expect(suggestDueDateString("initial_application", WED, intervals)).toBe(
      "2026-11-05",
    );
    expect(suggestDueDateString("general", WED, intervals)).toBe("2026-11-06");
  });
});

describe("parseIntervals", () => {
  it("fills defaults and ignores garbage", () => {
    expect(parseIntervals(null)).toEqual({
      application_days: 3,
      second_days: 7,
      interview_days: 2,
      assessment_days: 3,
    });
    expect(
      parseIntervals({ application_days: 5, interview_days: "x", second_days: -1 }),
    ).toEqual({
      application_days: 5,
      second_days: 7,
      interview_days: 2,
      assessment_days: 3,
    });
  });
});

describe("bucketFollowUp", () => {
  const now = new Date(2026, 10, 5, 9, 0, 0); // Thu Nov 5
  it("classifies by due date", () => {
    expect(
      bucketFollowUp(
        { due_date: "2026-11-04", status: "pending", snoozed_until: null },
        now,
      ),
    ).toBe("overdue");
    expect(
      bucketFollowUp(
        { due_date: "2026-11-05", status: "pending", snoozed_until: null },
        now,
      ),
    ).toBe("today");
    expect(
      bucketFollowUp(
        { due_date: "2026-11-06", status: "pending", snoozed_until: null },
        now,
      ),
    ).toBe("upcoming");
  });
  it("completed and cancelled win", () => {
    expect(
      bucketFollowUp(
        { due_date: "2026-11-01", status: "completed", snoozed_until: null },
        now,
      ),
    ).toBe("completed");
    expect(
      bucketFollowUp(
        { due_date: "2026-11-01", status: "cancelled", snoozed_until: null },
        now,
      ),
    ).toBe("cancelled");
  });
  it("snoozed until the future stays snoozed; elapsed snooze falls back to due-date bucket", () => {
    expect(
      bucketFollowUp(
        { due_date: "2026-11-01", status: "snoozed", snoozed_until: "2026-11-10" },
        now,
      ),
    ).toBe("snoozed");
    expect(
      bucketFollowUp(
        { due_date: "2026-11-01", status: "snoozed", snoozed_until: "2026-11-05" },
        now,
      ),
    ).toBe("overdue");
  });
});

describe("daysFromDue", () => {
  it("positive when overdue, negative when upcoming", () => {
    const now = new Date(2026, 10, 5);
    expect(daysFromDue("2026-11-02", now)).toBe(3);
    expect(daysFromDue("2026-11-05", now)).toBe(0);
    expect(daysFromDue("2026-11-08", now)).toBe(-3);
  });
});
