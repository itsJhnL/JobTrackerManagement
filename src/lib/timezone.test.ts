import { describe, expect, it } from "vitest";

import {
  describeTimezone,
  formatOffset,
  isValidTimezone,
  isoToZonedInput,
  listTimezones,
  offsetMinutes,
  todayInZone,
  zonedInputToIso,
} from "./timezone";

describe("timezone helpers", () => {
  it("validates IANA identifiers", () => {
    expect(isValidTimezone("Asia/Manila")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
  });

  it("computes offsets, including DST", () => {
    expect(offsetMinutes("Asia/Manila", new Date("2026-07-01T00:00:00Z"))).toBe(480);
    expect(offsetMinutes("Asia/Manila", new Date("2026-01-01T00:00:00Z"))).toBe(480);
    // New York: EDT in July (-4h), EST in January (-5h)
    expect(offsetMinutes("America/New_York", new Date("2026-07-01T12:00:00Z"))).toBe(
      -240,
    );
    expect(offsetMinutes("America/New_York", new Date("2026-01-01T12:00:00Z"))).toBe(
      -300,
    );
    // Kolkata: +5:30
    expect(offsetMinutes("Asia/Kolkata", new Date("2026-01-01T12:00:00Z"))).toBe(330);
    expect(formatOffset(330)).toBe("+05:30");
    expect(formatOffset(-240)).toBe("-04:00");
  });

  it("describes a zone with city, region and offset", () => {
    const z = describeTimezone("Asia/Manila", new Date("2026-11-06T00:00:00Z"));
    expect(z).toMatchObject({
      id: "Asia/Manila",
      city: "Manila",
      region: "Asia",
      offset: "+08:00",
      common: true,
    });
    expect(describeTimezone("America/New_York").city).toBe("New York");
  });

  it("lists zones with Manila and UTC pinned to the top", () => {
    const list = listTimezones();
    expect(list.length).toBeGreaterThan(300);
    expect(list[0].id).toBe("Asia/Manila");
    expect(list[1].id).toBe("UTC");
    expect(list.some((z) => z.id === "Europe/London")).toBe(true);
    expect(list.every((z) => !z.id.startsWith("Etc/"))).toBe(true);
  });

  it("round-trips datetime-local input through the preferred zone", () => {
    // 2026-03-10 09:30 in Manila is 01:30Z
    expect(zonedInputToIso("2026-03-10T09:30", "Asia/Manila")).toBe(
      "2026-03-10T01:30:00.000Z",
    );
    expect(isoToZonedInput("2026-03-10T01:30:00.000Z", "Asia/Manila")).toBe(
      "2026-03-10T09:30",
    );
    // Same wall-clock in New York (EDT after 8 Mar 2026) is 13:30Z
    expect(zonedInputToIso("2026-03-10T09:30", "America/New_York")).toBe(
      "2026-03-10T13:30:00.000Z",
    );
    // Across a DST boundary: 2026-11-01 01:30 EST (after fall back) → 06:30Z
    expect(isoToZonedInput("2026-11-01T06:30:00.000Z", "America/New_York")).toBe(
      "2026-11-01T01:30",
    );
  });

  it("gives today's calendar date in a zone", () => {
    // 23:30Z on Nov 5 is already Nov 6 in Manila, still Nov 5 in New York.
    const at = new Date("2026-11-05T23:30:00Z");
    expect(todayInZone("Asia/Manila", at)).toBe("2026-11-06");
    expect(todayInZone("America/New_York", at)).toBe("2026-11-05");
  });
});
