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
  savedToApplications: number;
  applicationsCreated: number;
  filtered: number;
  remaining: number;
  aiUnavailable: string | null;
  errors: string[];
}
interface CalendarResult {
  fetched: number;
  upserted: number;
  cancelled: number;
  interviewsCreated: number;
  interviewsLinked: number;
  interviewsUpdated: number;
  unmatched: number;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** One line describing what a calendar sync changed. */
export function describeCalendarSync(r: CalendarResult) {
  const parts = [
    r.interviewsCreated ? `${plural(r.interviewsCreated, "interview")} added` : null,
    r.interviewsLinked ? `${r.interviewsLinked} linked to existing interviews` : null,
    r.interviewsUpdated ? `${r.interviewsUpdated} updated` : null,
  ].filter(Boolean);
  return parts.length
    ? `Calendar synced: ${parts.join(", ")}`
    : `Calendar synced: no new interviews in ${plural(r.upserted, "event")}`;
}

async function callSync<T>(kind: GoogleSyncKind, auto = false): Promise<T> {
  const res = await fetch("/api/integrations/google/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, auto }),
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
      toast.success(describeCalendarSync(r), {
        id,
        description: r.unmatched
          ? `${plural(r.unmatched, "possible interview")} need${r.unmatched === 1 ? "s" : ""} an application. See the Interviews page.`
          : undefined,
      });
    } else {
      let scanned = 0;
      let total = 0;
      let done = 0;
      let recruiting = 0;
      let saved = 0;
      let created = 0;
      let filtered = 0;
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
        saved += r.savedToApplications ?? 0;
        created += r.applicationsCreated ?? 0;
        filtered += r.filtered ?? 0;
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
      const message =
        recruiting || saved || filtered
          ? `${plural(recruiting, "email")} for your Inbox`
          : `Scanned ${scanned} emails, nothing new`;
      const detail = [
        saved
          ? `${plural(saved, "application confirmation")} saved to Applications${created ? ` (${created} new)` : ""}`
          : null,
        filtered
          ? `${filtered} job alert${filtered === 1 ? "" : "s"} or other emails filtered out`
          : null,
      ]
        .filter(Boolean)
        .join(". ");
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
      else toast.success(message, { id, description: detail || undefined });
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

/**
 * Background refreshes. The server decides whether anything runs (connected,
 * permission granted, not synced recently), so these are safe to call often.
 * They stay quiet unless something new turned up.
 */
export async function autoSyncCalendar(onChange?: () => void) {
  if (snapshot.calendar) return;
  setRunning("calendar", true);
  try {
    const r = await callSync<CalendarResult | { skipped: true }>("calendar", true);
    if ("skipped" in r) return;
    if (r.interviewsCreated + r.interviewsLinked + r.interviewsUpdated > 0) {
      toast.success(describeCalendarSync(r), {
        description: "Found on your Google Calendar.",
      });
      onChange?.();
    }
  } catch {
    // Background refresh: failures surface on the next manual sync instead.
  } finally {
    setRunning("calendar", false);
  }
}

export async function autoSyncGmail(opts: {
  onChange?: () => void;
  openInbox?: () => void;
}) {
  if (snapshot.gmail) return;
  setRunning("gmail", true);
  try {
    // One time-boxed batch per run; anything left is picked up by the next run.
    const r = await callSync<GmailBatch | { skipped: true }>("gmail", true);
    if ("skipped" in r) return;
    if (r.stored > 0) opts.onChange?.();
    if (r.recruiting > 0)
      toast.info(
        `${plural(r.recruiting, "new job email")} in your Inbox`,
        opts.openInbox
          ? { action: { label: "Open Inbox", onClick: opts.openInbox } }
          : undefined,
      );
  } catch {
    // Background refresh: failures surface on the next manual sync instead.
  } finally {
    setRunning("gmail", false);
  }
}
