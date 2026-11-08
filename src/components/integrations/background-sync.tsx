"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { autoSyncCalendar, autoSyncGmail } from "./google-sync";

/** How often to check the unread count (cheap: one count query). */
const POLL_MS = 60_000;
/** How often to ask the server for a background Gmail/Calendar sync. */
const SYNC_MS = 10 * 60_000;

/**
 * Mounted once in the app shell. Keeps the Inbox badge, notifications and
 * pages current without a manual reload:
 *  - asks the server to sync Gmail and Calendar on load and every 10 minutes
 *    (the server skips when not connected or synced recently);
 *  - checks the unread count every minute and whenever the tab regains focus,
 *    refreshing server data when it changed (e.g. emails read in another tab).
 * Everything pauses while the tab is hidden.
 */
export function BackgroundSync({ unread }: { unread: number }) {
  const router = useRouter();
  const known = useRef(unread);

  // The server-rendered count is the source of truth after every refresh.
  useEffect(() => {
    known.current = unread;
  }, [unread]);

  useEffect(() => {
    const refresh = () => router.refresh();
    let lastSync = 0;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/inbox/status", { cache: "no-store" });
        if (!res.ok) return;
        const { unread: now } = (await res.json()) as { unread: number };
        if (now !== known.current) {
          known.current = now;
          refresh();
        }
      } catch {
        // Offline or server restarting: try again next tick.
      }
    };

    const sync = () => {
      if (document.hidden) return;
      lastSync = Date.now();
      void autoSyncCalendar(refresh);
      void autoSyncGmail({ onChange: refresh, openInbox: () => router.push("/inbox") });
    };

    const onVisible = () => {
      if (document.hidden) return;
      void poll();
      if (Date.now() - lastSync >= SYNC_MS) sync();
    };

    sync();
    const pollTimer = window.setInterval(poll, POLL_MS);
    const syncTimer = window.setInterval(sync, SYNC_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(pollTimer);
      window.clearInterval(syncTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);

  return null;
}
