/**
 * Decides whether a Google Calendar event is a job interview, which application
 * it belongs to, and what kind of interview it is. Pure and unit tested.
 *
 * Detection is deterministic (no AI call per event): calendar invites for
 * interviews almost always say so in the title, come from the employer's domain
 * or name the company. An event is only tracked automatically when it is
 * clearly an interview AND confidently matches one application; anything less
 * is offered to the user as a suggestion instead of being guessed.
 */

import type { InterviewType } from "@/lib/constants";

import {
  emailDomain,
  matchEmailToApplication,
  type MatchCandidate,
  type MatchResult,
} from "./matching";

export interface CalendarEventInput {
  summary: string | null;
  description?: string | null;
  location?: string | null;
  meetingUrl: string | null;
  allDay: boolean;
  organizer?: {
    email?: string | null;
    displayName?: string | null;
    self?: boolean;
  } | null;
  attendees?: {
    email?: string | null;
    displayName?: string | null;
    self?: boolean;
    resource?: boolean;
  }[];
}

export interface InterviewDetection {
  isInterview: boolean;
  /** Matched application, only when the match is confident and unambiguous. */
  applicationId: string | null;
  matchConfidence: number;
  /** Track without asking: clearly an interview and confidently matched. */
  autoTrack: boolean;
  interviewType: InterviewType;
  platform: string | null;
  interviewer: string | null;
  /** Best guess at the company, to prefill the "track" form for suggestions. */
  companyGuess: string | null;
  reason: string;
}

const INTERVIEW_WORDS =
  /\b(interview(s|ing)?|screening|phone screen|recruiter (call|screen|chat)|hiring manager|technical (round|call|interview|assessment)|coding (round|interview|session)|final round|panel (interview|round)|culture fit|offer call|hr (call|interview|screen(ing)?)|talent (call|screen|acquisition)|initial call|first round|second round|third round|next round|exam|skills test|trial task review)\b/i;

const NOT_INTERVIEW =
  /\b(stand-?up|1:1|one[- ]on[- ]one|birthday|holiday|lunch|dinner|breakfast|gym|workout|dentist|doctor|church|flight|out of office|ooo|sprint|retro(spective)?|all[- ]hands|town ?hall|webinar|class|lecture|haircut|payday|bills?)\b/i;

const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "group.calendar.google.com",
  "resource.calendar.google.com",
  "calendly.com",
  "zoom.us",
  "google.com",
  "linkedin.com",
  "greenhouse.io",
  "lever.co",
  "workable.com",
  "ashbyhq.com",
  "goodtime.io",
]);

export function platformFromMeetingUrl(url: string | null, text = ""): string | null {
  const u = (url ?? "").toLowerCase();
  if (u.includes("meet.google.com")) return "Google Meet";
  if (u.includes("zoom.us")) return "Zoom";
  if (u.includes("teams.microsoft.com") || u.includes("teams.live.com"))
    return "Microsoft Teams";
  if (u.includes("webex.com")) return "Webex";
  if (u.includes("skype.com")) return "Skype";
  if (/\b(phone call|by phone|call you at|dial)\b/i.test(text)) return "Phone";
  return null;
}

function interviewTypeFor(
  text: string,
  meetingUrl: string | null,
  location: string | null,
) {
  if (/\bfinal\b/i.test(text)) return "final" as const;
  if (/\bpanel\b/i.test(text)) return "panel" as const;
  if (
    /\b(technical|coding|tech screen|pair programming|system design|live code|take-home)\b/i.test(
      text,
    )
  )
    return "technical" as const;
  if (/\b(behaviou?ral|culture)\b/i.test(text)) return "behavioral" as const;
  if (
    /\b(phone|screen(ing)?|recruiter|hr call|initial call|intro(ductory)? call)\b/i.test(
      text,
    )
  )
    return "phone_screen" as const;
  if (/\b(on-?site|in[- ]person|office visit)\b/i.test(text)) return "onsite" as const;
  if (!meetingUrl && location && !/https?:\/\//i.test(location)) return "onsite" as const;
  if (meetingUrl) return "video" as const;
  return "other" as const;
}

function titleCase(s: string) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Guesses the employer from the invite (domain first, then common title patterns). */
export function guessCompany(e: CalendarEventInput): string | null {
  const people = [e.organizer, ...(e.attendees ?? [])].filter(
    (p) => p && !p.self && p.email,
  );
  for (const p of people) {
    const domain = emailDomain(p!.email);
    if (
      domain &&
      !GENERIC_DOMAINS.has(domain) &&
      !domain.endsWith(".calendar.google.com")
    ) {
      const parts = domain.split(".");
      const base =
        parts.length > 2 && parts.at(-2)!.length <= 3 ? parts.at(-3) : parts.at(-2);
      if (base && base.length > 1) return titleCase(base.replace(/[-_]/g, " "));
    }
  }
  const s = (e.summary ?? "").trim();
  const patterns = [
    /\b(?:[Ii]nterview|[Cc]all|[Ss]creening|[Cc]hat|[Mm]eeting)\s+(?:at|with)\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/,
    /^([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})\s*(?:[-–|:]|<>)\s*.*\binterview/i,
    /^([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})\s+interview\b/,
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    const name = m?.[1]?.trim();
    if (
      name &&
      !/^(interview|phone|video|technical|final|first|second|the|an?|my)$/i.test(name)
    )
      return name;
  }
  return null;
}

function interviewerFor(e: CalendarEventInput): string | null {
  const people = [e.organizer, ...(e.attendees ?? [])].filter(
    (p) => p && !p.self && !(p as { resource?: boolean }).resource,
  );
  const p = people[0];
  return p ? p.displayName?.trim() || p.email?.trim() || null : null;
}

export function detectInterview(
  e: CalendarEventInput,
  candidates: MatchCandidate[],
): InterviewDetection {
  const summary = e.summary ?? "";
  const description = (e.description ?? "").slice(0, 4000);
  const text = `${summary}\n${description}`;
  const typeText = summary || description;

  const base = {
    interviewType: interviewTypeFor(typeText, e.meetingUrl, e.location ?? null),
    platform: platformFromMeetingUrl(e.meetingUrl, text),
    interviewer: interviewerFor(e),
    companyGuess: null as string | null,
  };

  if (e.allDay)
    return {
      ...base,
      isInterview: false,
      applicationId: null,
      matchConfidence: 0,
      autoTrack: false,
      reason: "all-day event",
    };

  // Best application match across everyone on the invite plus the event text.
  const emails = [e.organizer, ...(e.attendees ?? [])]
    .filter((p) => p && !p.self && p.email)
    .map((p) => p!.email!.toLowerCase());
  let match: MatchResult = matchEmailToApplication(
    { from_email: null, subject: summary, text: `${description}\n${e.location ?? ""}` },
    candidates,
  );
  for (const email of emails) {
    const m = matchEmailToApplication(
      {
        from_email: email,
        subject: summary,
        text: `${description}\n${e.location ?? ""}`,
      },
      candidates,
    );
    if (m.confidence > match.confidence) match = m;
  }

  const saysInterview =
    INTERVIEW_WORDS.test(summary) || INTERVIEW_WORDS.test(description);
  const titleSaysInterview = INTERVIEW_WORDS.test(summary);
  const looksPersonal = NOT_INTERVIEW.test(summary) && !titleSaysInterview;
  const hasOthers = emails.length > 0;
  const matched = !!match.applicationId;

  const isInterview =
    !looksPersonal &&
    (titleSaysInterview ||
      (saysInterview && (!!e.meetingUrl || hasOthers || matched)) ||
      // No keyword, but the invite is with a company you applied to.
      (matched && match.confidence >= 0.6 && (!!e.meetingUrl || hasOthers)));

  const autoTrack = isInterview && matched;

  return {
    ...base,
    isInterview,
    applicationId: isInterview ? match.applicationId : null,
    matchConfidence: isInterview ? match.confidence : 0,
    autoTrack,
    companyGuess: isInterview && !matched ? guessCompany(e) : null,
    reason: !isInterview
      ? looksPersonal
        ? "looks personal"
        : "no interview signals"
      : matched
        ? `interview with a matching application (${match.reason})`
        : "interview, but no application matched",
  };
}
