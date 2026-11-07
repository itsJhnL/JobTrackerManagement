import { describe, expect, it } from "vitest";

import { formatMoney } from "./format";

describe("formatMoney", () => {
  it("keeps whole amounts without decimals", () => {
    expect(formatMoney(1732, "USD")).toBe("$1,732");
  });
  it("always shows two decimals when there are cents", () => {
    expect(formatMoney(31508.5, "PHP")).toBe("₱31,508.50");
    expect(formatMoney(136431.81, "PHP")).toBe("₱136,431.81");
    expect(formatMoney(12.5, "USD")).toBe("$12.50");
  });
  it("respects a zero-decimal request", () => {
    expect(formatMoney(31508.5, "PHP", { maximumFractionDigits: 0 })).toBe("₱31,509");
  });
  it("renders a dash for missing values", () => {
    expect(formatMoney(null, "USD")).toBe("—");
  });
});
