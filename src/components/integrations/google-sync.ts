"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";

/**
 * Runs Gmail / Calendar syncs from the browser with plain fetch, so they keep
 * going while the user moves between pages (server actions block navigation).
 * State lives at module level, so every Sync button shows the same status and
 * a second click while a sync is running is ignored.
 */
export type GoogleSyncKind = "gmail" | "calendar";

type Snapshot = Record<GoogleSyncKind, boolean>;
const IDLE: Snapshot = { gmail: false, calendar: false };

let snapshot: Snapshot = IDLE;
const listeners = new Set<() => void>();

function setRunning(kind: GoogleSyncKind, running: boolean) {
  snapshot = { ...snapshot, [kind]: running };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Which syncs are running right now. */
export function useGoogleSyncStatus(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => IDLE,
  );
}

interface GmailBatch {
  scanned: number;
  fresh: number;
  stored: number;
  recruiting: number;
  remaining: number;
  aiUnavailable: string | null;
  errors: string[];
}
interface CalendarResult {
  fetched: number;
  upserted: number;
  cancelled: number;
}

async function callSync<T>(kind: GoogleSyncKind): Promise<T> {
  const res = await fetch("/api/integrations/google/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  });
  const json = (await res.json().catch(() => null)) as
    { ok: true; data: T } | { ok: false; error?: string } | null;
  if (!json || !json.ok)
    throw new Error(
      (json && !json.ok && json.error) ||
        (res.status === 504
          ? "The sync timed out. Try again; finished emails are kept."
          : `Sync failed (${res.status}).`),
    );
  return json.data;
}

/** Safety cap on Gmail batches per click (each batch is ~25 s of work). */
const MAX_GMAIL_BATCHES = 12;

/**
 * Starts a sync unless one of the same kind is already running.
 * `onDone` runs after success (e.g. router.refresh) even if the user navigated away.
 */
export async function startGoogleSync(kind: GoogleSyncKind, onDone?: () => void) {
  if (snapshot[kind]) return;
  setRunning(kind, true);
  const label = kind === "gmail" ? "Gmail" : "Calendar";
  const id = toast.loading(`Syncing ${label}…`, {
    description: "You can keep using the app while this runs.",
  });

  try {
    if (kind === "calendar") {
      const r = await callSync<CalendarResult>("calendar");
      toast.success(
        `Synced ${r.upserted} event${r.upserted === 1 ? "" : "s"}${r.cancelled ? `, ${r.cancelled} cancelled` : ""}`,
        { id, description: undefined },
      );
    } else {
      let scanned = 0;
      let total = 0;
      let done = 0;
      let recruiting = 0;
      let errors: string[] = [];
      let aiBusy = false;
      for (let batch = 0; batch < MAX_GMAIL_BATCHES; batch++) {
        const r = await callSync<GmailBatch>("gmail");
        if (batch === 0) {
          scanned = r.scanned;
          total = r.fresh;
        }
        done += r.stored;
        recruiting += r.recruiting;
        errors = r.errors;
        if (r.aiUnavailable) {
          aiBusy = true;
          break;
        }
        // Stop when finished, or when a batch made no progress (avoids retrying failures forever).
        if (r.remaining === 0 || r.stored === 0) break;
        toast.loading(`Syncing Gmail… ${done} of ${total} new emails checked`, {
          id,
          description: "You can keep using the app while this runs.",
        });
      }
      const message = `Scanned ${scanned}, ${recruiting} recruiting email${recruiting === 1 ? "" : "s"} queued for review`;
      const unchecked = total - done;
      if (aiBusy)
        toast.warning("Gemini is busy right now", {
          id,
          description: `Checked ${done} of ${total} new emails. The other ${unchecked} will be checked when you sync again in a few minutes.`,
        });
      else if (errors.length)
        toast.warning(message, {
          id,
          description: `${errors.length} email${errors.length === 1 ? "" : "s"} could not be processed. Sync again to retry them.`,
        });
      else toast.success(message, { id, description: undefined });
    }
    onDone?.();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Sync failed.", {
      id,
      description: undefined,
    });
  } finally {
    setRunning(kind, false);
  }
}
