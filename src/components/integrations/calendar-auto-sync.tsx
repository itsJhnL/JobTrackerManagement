"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { autoSyncCalendar } from "./google-sync";

/** Mounted once in the app layout: refreshes Google Calendar in the background. */
export function CalendarAutoSync() {
  const router = useRouter();
  useEffect(() => {
    void autoSyncCalendar(() => router.refresh());
  }, [router]);
  return null;
}
