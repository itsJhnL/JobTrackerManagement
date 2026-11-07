"use client";

import { createContext, useContext, useMemo } from "react";

import {
  formatDate,
  formatDateTime,
  formatRelativeDay,
  formatTime,
  formatTimeAgo,
} from "@/lib/format";
import {
  DEFAULT_TIMEZONE,
  isoToZonedInput,
  todayInZone,
  zonedInputToIso,
} from "@/lib/timezone";

const TimezoneContext = createContext<string>(DEFAULT_TIMEZONE);

/** Provides the user's preferred IANA time zone to client components. */
export function TimezoneProvider({
  timeZone,
  children,
}: {
  timeZone: string;
  children: React.ReactNode;
}) {
  return <TimezoneContext.Provider value={timeZone}>{children}</TimezoneContext.Provider>;
}

export function useTimezone() {
  return useContext(TimezoneContext);
}

/** Formatters pre-bound to the user's time zone, for client components. */
export function useFormat() {
  const tz = useTimezone();
  return useMemo(
    () => ({
      timeZone: tz,
      date: (v: string | Date | null | undefined, pattern?: string) =>
        formatDate(v, pattern),
      dateTime: (v: string | Date | null | undefined) => formatDateTime(v, tz),
      time: (v: string | Date | null | undefined) => formatTime(v, tz),
      relativeDay: (v: string | Date | null | undefined) => formatRelativeDay(v, tz),
      timeAgo: (v: string | Date | null | undefined) => formatTimeAgo(v),
      toInput: (iso: string | null | undefined) => isoToZonedInput(iso, tz),
      fromInput: (value: string) => zonedInputToIso(value, tz),
      today: () => todayInZone(tz),
    }),
    [tz],
  );
}
