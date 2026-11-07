import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-redirect";

const backslash = String.fromCharCode(92);

describe("safeNextPath", () => {
  it("keeps same-origin paths with their query", () => {
    expect(safeNextPath("/settings?tab=preferences")).toBe("/settings?tab=preferences");
    expect(safeNextPath("/applications/abc#notes")).toBe("/applications/abc#notes");
  });
  it("rejects other origins and junk", () => {
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath(`/${backslash}evil.com`)).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("javascript:alert(1)")).toBe("/dashboard");
  });
});
