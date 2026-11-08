import { describe, expect, it } from "vitest";

import { isEmailUnread } from "./inbox";

describe("isEmailUnread", () => {
  it("is unread only while awaiting review and never opened", () => {
    expect(isEmailUnread({ review_status: "pending", extracted: {} })).toBe(true);
    expect(isEmailUnread({ review_status: "pending", extracted: null })).toBe(true);
    expect(
      isEmailUnread({
        review_status: "pending",
        extracted: { read_at: "2026-11-07T00:00:00Z" },
      }),
    ).toBe(false);
    expect(isEmailUnread({ review_status: "confirmed", extracted: {} })).toBe(false);
    expect(isEmailUnread({ review_status: "dismissed", extracted: {} })).toBe(false);
  });
});
