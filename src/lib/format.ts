import {
  format,
  formatDistanceToNowStrict,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
} from "date-fns";

import { RATE_TYPE_SUFFIX, type RateType } from "@/lib/constants";

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
  // Date-only strings (YYYY-MM-DD) are parsed as local dates to avoid TZ shifts.
  const d = value.length === 10 ? parseISO(value) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Nov 5, 2026" */
export function formatDate(
  value: string | Date | null | undefined,
  pattern = "MMM d, yyyy",
) {
  const d = toDate(value);
  return d ? format(d, pattern) : "—";
}

/** "Nov 5, 2026, 3:30 PM" */
export function formatDateTime(value: string | Date | null | undefined) {
  const d = toDate(value);
  return d ? format(d, "MMM d, yyyy, h:mm a") : "—";
}

/** "Today", "Tomorrow", "Yesterday", or "Nov 5" */
export function formatRelativeDay(value: string | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(
    d,
    d.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy",
  );
}

/** "3 days ago", "in 2 hours" */
export function formatTimeAgo(value: string | Date | null | undefined) {
  const d = toDate(value);
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : "—";
}

/** YYYY-MM-DD in local time, for <input type="date"> and date columns. */
export function toDateInputValue(value: string | Date | null | undefined) {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd") : "";
}

export function todayDateString() {
  return format(new Date(), "yyyy-MM-dd");
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
