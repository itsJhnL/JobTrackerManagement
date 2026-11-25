import { describe, expect, it } from "vitest";

import { fail } from "./action-result";

describe("fail", () => {
  it("explains a missing On hold migration", () => {
    const r = fail('invalid input value for enum application_status: "on_hold"');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/0004_status_on_hold\.sql/);
  });

  it("passes other messages through", () => {
    const r = fail("Application not found.");
    if (!r.ok) expect(r.error).toBe("Application not found.");
  });
});
