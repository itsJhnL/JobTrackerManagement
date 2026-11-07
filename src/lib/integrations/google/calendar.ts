import "server-only";

import { googleFetch } from "./client";

const BASE = "https://www.googleapis.com/calendar/v3";

export interface CalendarEvent {
  id: string;
  status?: string; // confirmed | tentative | cancelled
  summary?: string;
  description?: string;
  htmlLink?: string;
  hangoutsLink?: string;
  location?: string;
  etag?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  extendedProperties?: { private?: Record<string, string> };
}

/** The private key we stamp on events we create, to recognise them on sync. */
export const APP_EVENT_KEY = "jobTrackerInterviewId";

export async function listUpcomingEvents(
  accessToken: string,
  options: { calendarId?: string; days?: number; maxResults?: number } = {},
): Promise<CalendarEvent[]> {
  const calendarId = encodeURIComponent(options.calendarId ?? "primary");
  const now = new Date();
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + (options.days ?? 60) * 86_400_000).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(options.maxResults ?? 100),
    showDeleted: "true",
  });
  const json = await googleFetch<{ items?: CalendarEvent[] }>(
    accessToken,
    `${BASE}/calendars/${calendarId}/events?${params}`,
  );
  return json.items ?? [];
}

export interface NewEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  timeZone?: string | null;
  location?: string | null;
  interviewId: string;
}

function toBody(input: NewEventInput) {
  return {
    summary: input.summary,
    description: input.description,
    location: input.location ?? undefined,
    start: {
      dateTime: input.startIso,
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    },
    end: {
      dateTime: input.endIso,
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 60 },
        { method: "popup", minutes: 1440 },
      ],
    },
    extendedProperties: { private: { [APP_EVENT_KEY]: input.interviewId } },
  };
}

export function insertEvent(
  accessToken: string,
  input: NewEventInput,
  calendarId = "primary",
) {
  return googleFetch<CalendarEvent>(
    accessToken,
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(toBody(input)),
    },
  );
}

export function updateEvent(
  accessToken: string,
  eventId: string,
  input: NewEventInput,
  calendarId = "primary",
) {
  return googleFetch<CalendarEvent>(
    accessToken,
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(toBody(input)),
    },
  );
}

export function deleteEvent(
  accessToken: string,
  eventId: string,
  calendarId = "primary",
) {
  return googleFetch<void>(
    accessToken,
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
    },
  );
}

/** Finds a meeting link on an event (Meet, Zoom, Teams…). */
export function eventMeetingUrl(e: CalendarEvent): string | null {
  const video = e.conferenceData?.entryPoints?.find(
    (p) => p.entryPointType === "video",
  )?.uri;
  if (video) return video;
  if (e.hangoutsLink) return e.hangoutsLink;
  const text = `${e.location ?? ""}\n${e.description ?? ""}`;
  const m =
    /https?:\/\/(?:[\w.-]*zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com)[^\s"'<>]*/i.exec(
      text,
    );
  return m?.[0] ?? null;
}
