import { describe, expect, it } from "vitest";

import {
  categoryForActivity,
  categoryForEmailKind,
  categoryForStatus,
  isNotificationUnread,
  notificationDescription,
  notificationHref,
  notificationMetadata,
  statusChangeTitle,
} from "./notifications";

describe("categories", () => {
  it("maps statuses", () => {
    expect(categoryForStatus("hired")).toBe("hiring");
    expect(categoryForStatus("on_hold")).toBe("hiring");
    expect(categoryForStatus("offer")).toBe("offers");
    expect(categoryForStatus("interview")).toBe("interviews");
    expect(categoryForStatus("assessment")).toBe("interviews");
    expect(categoryForStatus("rejected")).toBe("applications");
    expect(categoryForStatus("applied")).toBe("applications");
  });

  it("maps email kinds", () => {
    expect(categoryForEmailKind("interview_invitation")).toBe("interviews");
    expect(categoryForEmailKind("job_offer")).toBe("offers");
    expect(categoryForEmailKind("rejection")).toBe("applications");
    expect(categoryForEmailKind("recruiter_response")).toBe("recruitment");
    expect(categoryForEmailKind(null)).toBe("recruitment");
  });

  it("maps activities, including older rows that stored `status`", () => {
    expect(categoryForActivity("status_changed", { from: "offer", to: "hired" })).toBe(
      "hiring",
    );
    expect(categoryForActivity("status_changed", { status: "offer" })).toBe("offers");
    expect(categoryForActivity("status_changed", {})).toBe("applications");
    expect(categoryForActivity("status_changed", { to: "nonsense" })).toBe(
      "applications",
    );
    expect(categoryForActivity("interview_scheduled", null)).toBe("interviews");
    expect(categoryForActivity("application_created", null)).toBe("applications");
  });
});

describe("read state", () => {
  const now = new Date("2026-11-27T00:00:00Z");

  it("sync events arrive unread", () => {
    const m = notificationMetadata("sync", { now });
    expect(m).toEqual({ notify: true, actor: "sync" });
    expect(isNotificationUnread(m)).toBe(true);
  });

  it("your own changes arrive read, except an offer or a hire", () => {
    expect(
      isNotificationUnread(notificationMetadata("you", { status: "applied", now })),
    ).toBe(false);
    expect(isNotificationUnread(notificationMetadata("you", { now }))).toBe(false);
    expect(
      isNotificationUnread(notificationMetadata("you", { status: "hired", now })),
    ).toBe(true);
    expect(
      isNotificationUnread(notificationMetadata("you", { status: "offer", now })),
    ).toBe(true);
  });

  it("can be forced read", () => {
    expect(
      isNotificationUnread(notificationMetadata("sync", { unread: false, now })),
    ).toBe(false);
  });

  it("history from before notifications is never unread", () => {
    expect(isNotificationUnread({ from: "applied", to: "hired" })).toBe(false);
    expect(isNotificationUnread(null)).toBe(false);
  });

  it("dismissed is not unread", () => {
    expect(isNotificationUnread({ notify: true, dismissed_at: "x" })).toBe(false);
  });
});

describe("text and links", () => {
  it("titles", () => {
    expect(statusChangeTitle("Acme", "hired")).toBe("You're hired at Acme");
    expect(statusChangeTitle("Acme", "offer")).toBe("Offer from Acme");
    expect(statusChangeTitle("Acme", "interview")).toBe("Acme moved to Interview");
  });

  it("descriptions", () => {
    expect(
      notificationDescription("status_changed", { from: "offer", to: "hired" }),
    ).toBe("Status changed from Offer to Hired");
    expect(notificationDescription("status_changed", { status: "offer" })).toBe(
      "Status is now Offer",
    );
  });

  it("links open the right tab", () => {
    expect(notificationHref("status_changed", "a1")).toBe("/applications/a1");
    expect(notificationHref("interview_scheduled", "a1")).toBe(
      "/applications/a1?tab=interviews",
    );
    expect(notificationHref("assessment_added", "a1")).toBe("/applications/a1?tab=tasks");
    expect(notificationHref("status_changed", null)).toBe("/applications");
  });
});
