/**
 * Time-zone helpers built on the runtime's IANA database (Intl), so the list
 * is always current and DST is handled by the platform, not by us.
 *
 * Rules:
 * - Timestamps are stored in UTC (timestamptz). They are converted to the
 *   user's preferred zone only when displayed, via src/lib/format.ts.
 * - Date-only values (applied_at, due_date) are calendar dates and never shift.
 */
import { TZDate } from "@date-fns/tz";

export const DEFAULT_TIMEZONE = "Asia/Manila";

/** Zones pinned to the top of the picker. Everything else follows alphabetically. */
export const COMMON_TIMEZONES = [
  "Asia/Manila",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
] as const;

export interface TimezoneOption {
  /** IANA identifier, e.g. "Asia/Manila". */
  id: string;
  /** "Manila" */
  city: string;
  /** "Asia" */
  region: string;
  /** "+08:00" at the given instant. */
  offset: string;
  /** Minutes east of UTC at the given instant. */
  offsetMinutes: number;
  /** "Philippine Standard Time" when the runtime knows it. */
  longName: string | null;
  /** "GMT+8" style short label. */
  shortName: string | null;
  common: boolean;
}

export function isValidTimezone(id: string | null | undefined): id is string {
  if (!id) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` from UTC at `at`, in minutes. Handles DST by construction. */
export function offsetMinutes(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export function formatOffset(minutes: number) {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

function names(timeZone: string, at: Date) {
  let longName: string | null = null;
  let shortName: string | null = null;
  try {
    longName =
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" })
        .formatToParts(at)
        .find((p) => p.type === "timeZoneName")?.value ?? null;
    shortName =
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
        .formatToParts(at)
        .find((p) => p.type === "timeZoneName")?.value ?? null;
  } catch {
    /* ignore */
  }
  return { longName, shortName };
}

export function describeTimezone(id: string, at: Date = new Date()): TimezoneOption {
  const [region = "", ...rest] = id.split("/");
  const city = (rest.length ? rest.join("/") : id).replace(/_/g, " ");
  const minutes = offsetMinutes(id, at);
  const { longName, shortName } = names(id, at);
  return {
    id,
    city,
    region,
    offset: formatOffset(minutes),
    offsetMinutes: minutes,
    longName,
    shortName,
    common: (COMMON_TIMEZONES as readonly string[]).includes(id),
  };
}

let cachedList: { at: number; list: TimezoneOption[] } | null = null;

/**
 * All IANA zones the runtime supports, described at `now`. Cached for ten
 * minutes because offsets only change at DST transitions.
 */
export function listTimezones(now: Date = new Date()): TimezoneOption[] {
  if (cachedList && now.getTime() - cachedList.at < 10 * 60_000) return cachedList.list;
  const ids = new Set<string>(["UTC", ...Intl.supportedValuesOf("timeZone")]);
  const list = [...ids]
    .filter((id) => id.includes("/") || id === "UTC")
    .filter((id) => !id.startsWith("Etc/"))
    .map((id) => describeTimezone(id, now));
  const commonIndex = new Map(COMMON_TIMEZONES.map((z, i) => [z, i] as const));
  list.sort((a, b) => {
    const ai = commonIndex.get(a.id as (typeof COMMON_TIMEZONES)[number]);
    const bi = commonIndex.get(b.id as (typeof COMMON_TIMEZONES)[number]);
    if (ai !== undefined || bi !== undefined) return (ai ?? 999) - (bi ?? 999);
    return a.id.localeCompare(b.id);
  });
  cachedList = { at: now.getTime(), list };
  return list;
}

/** "Manila (Asia) · UTC+08:00" */
export function timezoneLabel(id: string, at?: Date) {
  const z = describeTimezone(id, at);
  return `${z.city}${z.region ? ` (${z.region})` : ""} · UTC${z.offset}`;
}

/** Browser-detected zone, or the default on the server / when unsupported. */
export function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Interprets a "YYYY-MM-DDTHH:mm" wall-clock value (from <input type="datetime-local">)
 * in `timeZone` and returns the UTC ISO string to store.
 */
export function zonedInputToIso(value: string, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) throw new Error("Invalid date-time input");
  const [, y, mo, d, h, mi] = m.map(Number);
  // TZDate#toISOString keeps the zone offset; normalise to a UTC instant.
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, timeZone).getTime()).toISOString();
}

/** The reverse: UTC ISO → "YYYY-MM-DDTHH:mm" wall-clock in `timeZone` for inputs. */
export function isoToZonedInput(
  iso: string | null | undefined,
  timeZone: string,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Today's calendar date (YYYY-MM-DD) in `timeZone`. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return isoToZonedInput(now.toISOString(), timeZone).slice(0, 10);
}
