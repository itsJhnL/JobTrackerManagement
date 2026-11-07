import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  parseISO,
} from "date-fns";

import { RATE_TYPE_SUFFIX, type RateType } from "@/lib/constants";
import { DEFAULT_TIMEZONE, isValidTimezone, todayInZone } from "@/lib/timezone";

/**
 * Formatting helpers.
 *
 * Time zones: anything that is an instant (timestamptz) is formatted with an
 * explicit IANA `timeZone`. Server components pass the profile's zone; client
 * components use `useFormat()` from the TimezoneProvider. Calendar dates
 * (YYYY-MM-DD) are never shifted.
 */

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, maximumFractionDigits = 2) {
  const key = `${currency}:${maximumFractionDigits}`;
  let f = currencyFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits,
        minimumFractionDigits: 0,
      });
    } catch {
      f = new Intl.NumberFormat("en-US", {
        maximumFractionDigits,
        minimumFractionDigits: 0,
      });
    }
    currencyFormatters.set(key, f);
  }
  return f;
}

/** "$45" / "₱1,200.50" — never mixes currencies; always pass the row's own currency. */
export function formatMoney(
  amount: number | null | undefined,
  currency: string,
  opts: { maximumFractionDigits?: number } = {},
) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return currencyFormatter(currency, opts.maximumFractionDigits ?? 2).format(amount);
}

/** "$45/hr", "€4,000/mo", "$2,500 total" */
export function formatRate(
  amount: number | null | undefined,
  currency: string,
  rateType: RateType,
) {
  if (amount === null || amount === undefined) return "—";
  return `${formatMoney(amount, currency)}${RATE_TYPE_SUFFIX[rateType]}`;
}

export function formatCompact(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return formatMoney(amount, currency);
  }
}

export function formatHours(hours: number | null | undefined) {
  if (hours === null || hours === undefined) return "—";
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

export function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Date-only strings (YYYY-MM-DD) are parsed as plain calendar dates.
  const d = value.length === 10 ? parseISO(value) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeZone(timeZone: string | undefined) {
  return isValidTimezone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
function dtf(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let f = dateTimeFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, ...options });
    dateTimeFormatters.set(key, f);
  }
  return f;
}

/**
 * Calendar date. For date-only strings this never shifts; for instants it is
 * rendered in `timeZone` (pass the user's zone when the source is a timestamp).
 */
export function formatDate(
  value: string | Date | null | undefined,
  pattern = "MMM d, yyyy",
  timeZone?: string,
) {
  const d = toDate(value);
  if (!d) return "—";
  if (typeof value === "string" && value.length === 10) return format(d, pattern);
  if (!timeZone) return format(d, pattern);
  return dtf(safeZone(timeZone), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** "Nov 5, 2026, 3:30 PM" in the user's zone. */
export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone?: string,
) {
  const d = toDate(value);
  if (!d) return "—";
  return dtf(safeZone(timeZone), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** "3:30 PM" in the user's zone. */
export function formatTime(value: string | Date | null | undefined, timeZone?: string) {
  const d = toDate(value);
  if (!d) return "—";
  return dtf(safeZone(timeZone), { hour: "numeric", minute: "2-digit" }).format(d);
}

/** Short zone label for an instant, e.g. "GMT+8" or "EST". */
export function formatZoneAbbr(
  value: string | Date | null | undefined,
  timeZone?: string,
) {
  const d = toDate(value) ?? new Date();
  return (
    dtf(safeZone(timeZone), { timeZoneName: "short" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? ""
  );
}

/** Month/day parts for calendar tiles, in the user's zone. */
export function dateParts(value: string | Date, timeZone?: string) {
  const d = toDate(value) ?? new Date();
  const parts = dtf(safeZone(timeZone), {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { month: get("month"), day: get("day"), weekday: get("weekday") };
}

/**
 * "Today", "Tomorrow", "Yesterday", or "Nov 5". Date-only values compare
 * against today's date in `timeZone`; instants are converted first.
 */
export function formatRelativeDay(
  value: string | Date | null | undefined,
  timeZone?: string,
) {
  const d = toDate(value);
  if (!d) return "—";
  const tz = safeZone(timeZone);
  const today = parseISO(todayInZone(tz));
  const target =
    typeof value === "string" && value.length === 10
      ? d
      : parseISO(
          dtf(tz, { year: "numeric", month: "2-digit", day: "2-digit" })
            .formatToParts(d)
            .reduce(
              (acc, p) =>
                p.type === "year"
                  ? `${p.value}${acc}`
                  : p.type === "month"
                    ? `${acc}-${p.value}`
                    : p.type === "day"
                      ? `${acc}-${p.value}`
                      : acc,
              "",
            ),
        );
  const diff = differenceInCalendarDays(target, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return format(
    target,
    target.getFullYear() === today.getFullYear() ? "MMM d" : "MMM d, yyyy",
  );
}

/** "3 days ago", "in 2 hours" — zone-independent. */
export function formatTimeAgo(value: string | Date | null | undefined) {
  const d = toDate(value);
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : "—";
}

/** YYYY-MM-DD for a date-only value (no shifting). */
export function toDateInputValue(value: string | Date | null | undefined) {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd") : "";
}

/** Today's calendar date in the given zone (defaults to the app default zone). */
export function todayDateString(timeZone?: string) {
  return todayInZone(safeZone(timeZone));
}

/** "Full-time" from "full_time" when no label table exists. */
export function humanize(value: string | null | undefined) {
  if (!value) return "—";
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function initials(name: string | null | undefined, fallback = "?") {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
