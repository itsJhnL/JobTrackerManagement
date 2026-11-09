/**
 * Deterministic email rules that run before and after the AI classifier.
 *
 * Every email lands in exactly one place:
 *  - "inbox"        → needs the user's attention (recruiter/employer mail,
 *                     interviews, status updates, anything uncertain);
 *  - "applications" → an automated "we received your application" receipt;
 *                     it is saved to the matching application, not shown in
 *                     the Inbox;
 *  - "filtered"     → job alerts, marketing, newsletters, the user's own
 *                     sent mail. Stored and visible under Filtered, never
 *                     deleted, and can be moved back to the Inbox.
 *
 * Rules never rely on the sender alone: each one also checks the subject or
 * the content. When in doubt an email goes to the Inbox, so a real recruiter
 * message is never hidden. Pure and unit tested.
 */

import type { EmailKind } from "@/lib/ai/types";

import { emailDomain, type MatchResult } from "./matching";

export type EmailDestination = "inbox" | "applications" | "filtered";

export const FILTER_CATEGORIES = [
  "job_alert",
  "marketing",
  "newsletter",
  "spam",
  "sent_by_you",
  "other",
] as const;
export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

export const FILTER_CATEGORY_LABELS: Record<FilterCategory, string> = {
  job_alert: "Job alert",
  marketing: "Marketing",
  newsletter: "Newsletter",
  spam: "Spam",
  sent_by_you: "Sent by you",
  other: "Not job related",
};

/** Bumped when the rules change, so stored emails are re-checked once. */
export const EMAIL_RULES_VERSION = 1;

export interface RuleInput {
  from_email: string | null;
  from_name?: string | null;
  subject: string;
  text: string;
  /** Links from the HTML part. */
  links?: string[];
  /** Sender offers List-Unsubscribe (bulk mail). */
  bulk?: boolean;
  received_at: string;
  /** The connected Gmail address, to recognise the user's own mail. */
  account_email?: string | null;
}

/** What an application-confirmation email tells us. */
export interface ApplicationConfirmation {
  platform: string;
  company: string | null;
  job_title: string | null;
  location: string | null;
  /** Public posting URL (never a tokenised tracking link). */
  job_url: string | null;
  /** Stable job identifier on the platform (Indeed job key), for de-duplication. */
  job_key: string | null;
  /** Platform's application reference, if the email has one. */
  reference: string | null;
  applied_at: string;
}

export interface RouteDecision {
  kind: EmailKind;
  destination: EmailDestination;
  category: FilterCategory | null;
  /** Plain-language reason, shown in the Inbox. */
  reason: string;
  confirmation?: ApplicationConfirmation;
}

// ---------------------------------------------------------------------------
// Indeed application confirmations
// ---------------------------------------------------------------------------

const INDEED_SUBJECT = /^\s*indeed application:\s*(.+?)\s*$/i;
const SUBMITTED = /\bapplication (?:has been )?submitted\b/i;

function isIndeedDomain(domain: string | null) {
  return !!domain && (domain === "indeed.com" || domain.endsWith(".indeed.com"));
}

/** Indeed job key: 16 hex characters, in `jk=` or at the end of a /job/ slug. */
export function indeedJobKey(url: string | null | undefined) {
  if (!url) return null;
  const jk = /[?&](?:jk|vjk)=([0-9a-f]{16})\b/i.exec(url);
  if (jk) return jk[1].toLowerCase();
  const slug = /indeed\.[a-z.]+\/(?:m\/)?job\/[^?#]*?-?([0-9a-f]{16})(?:[/?#]|$)/i.exec(
    url,
  );
  return slug ? slug[1].toLowerCase() : null;
}

/** A link without its query string (tracking parameters), or null if invalid. */
function cleanUrl(href: string) {
  try {
    const u = new URL(href.replace(/^http:/i, "https:"));
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

/**
 * The job posting behind Indeed's tracked links: the `next=` target of the
 * "view job" link (an Indeed page or the employer's own careers site), or any
 * link carrying an Indeed job key.
 */
function indeedJobUrl(links: string[]) {
  const targets: string[] = [];
  for (const link of links) {
    try {
      const next = new URL(link).searchParams.get("next");
      if (next && /\/confirmemail\/viewjob/i.test(link)) targets.unshift(next);
      else if (next) targets.push(next);
      else targets.push(link);
    } catch {
      continue;
    }
  }
  const withKey = targets.find((t) => indeedJobKey(t));
  if (withKey) return { url: cleanUrl(withKey), key: indeedJobKey(withKey) };
  const viewJob = links.find((l) => /\/confirmemail\/viewjob/i.test(l));
  if (viewJob && targets[0]) return { url: cleanUrl(targets[0]), key: null };
  return null;
}

function indeedReference(links: string[]) {
  for (const link of links) {
    const m = /[?&]iaUid=([a-z0-9]+)/i.exec(link);
    if (m) return m[1];
  }
  return null;
}

/**
 * Reads an Indeed "Indeed Application: <title>" confirmation. Requires both
 * an Indeed sender and the confirmation wording, so a recruiter writing from
 * Indeed's messaging (or an Indeed job alert) is never mistaken for one.
 */
export function parseIndeedConfirmation(
  input: RuleInput,
): ApplicationConfirmation | null {
  if (!isIndeedDomain(emailDomain(input.from_email))) return null;
  if (!SUBMITTED.test(input.text)) return null;
  const subject = INDEED_SUBJECT.exec(input.subject);

  const lines = input.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const sentTo = /the following items were sent to\s+(.+?)\.?\s*(?:good luck|$)/i.exec(
    input.text.replace(/\n+/g, " "),
  );
  let company = sentTo?.[1]?.trim() ?? null;

  let title = subject?.[1]?.trim() ?? null;
  let location: string | null = null;
  const start = lines.findIndex((l) => /^application submitted$/i.test(l));
  if (start >= 0) {
    // Layout: "Application submitted" / title / company / "- location" / [reviews]
    const after = lines.slice(start + 1, start + 6);
    if (!title && after[0] && !/^-/.test(after[0])) title = after[0];
    const companyLine = after[1];
    if (!company && companyLine && !/^-/.test(companyLine)) company = companyLine;
    // "- Remote", "- Mandaluyong"; Indeed prints "- +" when there is none.
    const loc = after.find((l) => /^[-–]\s*\S/.test(l));
    const place = loc?.replace(/^[-–]\s*/, "").trim() ?? "";
    if (/\p{L}/u.test(place)) location = place;
  }

  const posting = indeedJobUrl(input.links ?? []);
  return {
    platform: "Indeed",
    company: company ? company.slice(0, 200) : null,
    job_title: title ? title.slice(0, 200) : null,
    location: location ? location.slice(0, 200) : null,
    job_url: posting?.url ?? null,
    job_key: posting?.key ?? null,
    reference: indeedReference(input.links ?? []),
    applied_at: input.received_at,
  };
}

// ---------------------------------------------------------------------------
// Job alerts and the user's own mail
// ---------------------------------------------------------------------------

/** Senders that only send job alerts / recommendations. */
const ALERT_SENDERS = [
  /@jobalerts?\.indeed\.com$/,
  /@match\.indeed\.com$/,
  /^jobalerts?-noreply@linkedin\.com$/,
  /^jobs-listings@linkedin\.com$/,
  /^jobs-noreply@linkedin\.com$/,
  /@jobalerts?\./,
];

/** Subject shapes used by job-alert and recommendation emails. */
const ALERT_SUBJECTS = [
  /\b\d+\s+more\b[^.]*\bjobs?\b/i,
  /\bjobs? (?:for you|in [A-Z]|matching|you might like)\b/i,
  /\b(?:is|are) hiring\b/i,
  /\bnew jobs?\b/i,
  /\bjob alerts?\b/i,
  /\brecommended jobs?\b/i,
  /\bapply now\.?\s*$/i,
  /\bactively recruiting\s*$/i,
  /\bjobs? similar to\b/i,
];

/** Wording that means the email is about the user's own application. */
const PERSONAL_CUES =
  /\b(?:your application|you applied|thank you for applying|application (?:status|update)|interview (?:invitation|invite|schedule)|we(?:'d| would) like to (?:invite|schedule|move)|next steps? in (?:our|the) (?:hiring|recruitment))\b/i;

/** Job boards whose bulk mail (with an alert-shaped subject) is an alert. */
const JOB_BOARD_DOMAINS =
  /(?:^|\.)(?:indeed\.com|linkedin\.com|glassdoor\.com|jobstreet\.com|onlinejobs\.ph|ziprecruiter\.com|monster\.com|kalibrr\.com|jora\.com|seek\.com\.au)$/;

export function isJobAlert(input: RuleInput) {
  const from = (input.from_email ?? "").toLowerCase();
  const domain = emailDomain(from) ?? "";
  const subjectLooksLikeAlert = ALERT_SUBJECTS.some((r) => r.test(input.subject));
  const fromAlertSender = ALERT_SENDERS.some((r) => r.test(from));
  // A message about the user's own application is never an alert, whoever sent it.
  if (PERSONAL_CUES.test(`${input.subject}\n${input.text.slice(0, 3000)}`)) return false;
  if (fromAlertSender) return true;
  return subjectLooksLikeAlert && (JOB_BOARD_DOMAINS.test(domain) || !!input.bulk);
}

function isOwnMail(input: RuleInput) {
  const from = (input.from_email ?? "").toLowerCase();
  return !!from && !!input.account_email && from === input.account_email.toLowerCase();
}

/**
 * Decides without the AI when the answer is certain. Returns null when the
 * AI should classify the email.
 */
export function preClassify(input: RuleInput): RouteDecision | null {
  if (isOwnMail(input))
    return {
      kind: "not_recruiting",
      destination: "filtered",
      category: "sent_by_you",
      reason: "Sent from your own address",
    };

  const indeed = parseIndeedConfirmation(input);
  if (indeed) {
    if (indeed.company && indeed.job_title)
      return {
        kind: "application_confirmation",
        destination: "applications",
        category: null,
        reason: "Indeed application confirmation",
        confirmation: indeed,
      };
    // Could not read the job: let the user see it rather than lose it.
    return {
      kind: "application_confirmation",
      destination: "inbox",
      category: null,
      reason: "Indeed confirmation, but the company or job title could not be read",
      confirmation: indeed,
    };
  }

  if (isJobAlert(input))
    return {
      kind: "not_recruiting",
      destination: "filtered",
      category: "job_alert",
      reason: "Job alert or recommendation",
    };

  return null;
}

// ---------------------------------------------------------------------------
// After the AI
// ---------------------------------------------------------------------------

/** Boilerplate questions that do not ask the candidate anything. */
const BOILERPLATE_QUESTION =
  /(?:questions?|concerns?|problems?|help|unsubscribe|trouble)[^?\n]{0,80}\?/gi;

const ASKS =
  /\b(?:please (?:reply|respond|answer|complete|confirm|send|share|provide|let (?:me|us) know|book|schedule)|let (?:me|us) know|your availability|are you available|answer the (?:following|questions?)|complete (?:the|this|a|our) (?:assessment|test|task|questionnaire|form)|schedule (?:a|an|your) (?:call|interview|meeting)|book a (?:time|slot|call))\b/i;

/** True when the email asks the candidate to reply or do something. */
export function asksCandidateToAct(text: string) {
  const body = text.slice(0, 2500).replace(BOILERPLATE_QUESTION, " ");
  return body.includes("?") || ASKS.test(body);
}

export interface AnalysisForRouting {
  kind: EmailKind;
  confidence: number;
  company: string | null;
  job_title: string | null;
  filter_category?: string | null;
}

/** Below this the AI's "not recruiting" is not trusted enough to hide an email. */
export const FILTER_MIN_CONFIDENCE = 0.7;

/**
 * Where an AI-classified email goes. Errs toward the Inbox: an email the AI
 * calls irrelevant still shows up when it comes from a known contact or the
 * company of an application, or when the AI is unsure.
 */
export function routeAnalysis(
  analysis: AnalysisForRouting,
  input: RuleInput,
  match: Pick<MatchResult, "applicationId" | "confidence" | "reason">,
): RouteDecision {
  if (analysis.kind === "not_recruiting") {
    const strongSender =
      !!match.applicationId &&
      /saved contact|sender domain/.test(match.reason) &&
      match.confidence >= 0.6;
    if (strongSender)
      return {
        kind: "other_recruiting",
        destination: "inbox",
        category: null,
        reason: "From a company you applied to, so kept in your Inbox",
      };
    if (analysis.confidence < FILTER_MIN_CONFIDENCE)
      return {
        kind: "other_recruiting",
        destination: "inbox",
        category: null,
        reason: "Possibly job related; check it",
      };
    const category = (FILTER_CATEGORIES as readonly string[]).includes(
      analysis.filter_category ?? "",
    )
      ? (analysis.filter_category as FilterCategory)
      : "other";
    return {
      kind: "not_recruiting",
      destination: "filtered",
      category,
      reason: FILTER_CATEGORY_LABELS[category],
    };
  }

  if (analysis.kind === "application_confirmation") {
    if (asksCandidateToAct(input.text))
      return {
        kind: "recruiter_response",
        destination: "inbox",
        category: null,
        reason: "Asks you to reply or do something",
      };
    if (analysis.company && analysis.job_title)
      return {
        kind: "application_confirmation",
        destination: "applications",
        category: null,
        reason: "Application received confirmation",
        confirmation: {
          platform: platformFromSender(input.from_email) ?? "Email",
          company: analysis.company.slice(0, 200),
          job_title: analysis.job_title.slice(0, 200),
          location: null,
          job_url: null,
          job_key: null,
          reference: null,
          applied_at: input.received_at,
        },
      };
    return {
      kind: "application_confirmation",
      destination: "inbox",
      category: null,
      reason: "Confirmation, but the company or job title is unclear",
    };
  }

  return { kind: analysis.kind, destination: "inbox", category: null, reason: "" };
}

const PLATFORM_DOMAINS: [RegExp, string][] = [
  [/(?:^|\.)indeed\.com$/, "Indeed"],
  [/(?:^|\.)linkedin\.com$/, "LinkedIn"],
  [/(?:^|\.)onlinejobs\.ph$/, "OnlineJobs.ph"],
  [/(?:^|\.)jobstreet\.com$/, "JobStreet"],
  [/(?:^|\.)glassdoor\.com$/, "Glassdoor"],
  [/(?:^|\.)upwork\.com$/, "Upwork"],
  [/(?:^|\.)kalibrr\.com$/, "Kalibrr"],
];

/** Job platform named by the sender's domain, if any. */
export function platformFromSender(email: string | null | undefined) {
  const domain = emailDomain(email);
  if (!domain) return null;
  return PLATFORM_DOMAINS.find(([r]) => r.test(domain))?.[1] ?? null;
}

/** review_status to store for a destination (the enum has no "filtered"). */
export function reviewStatusFor(destination: EmailDestination) {
  return destination === "inbox"
    ? ("pending" as const)
    : destination === "applications"
      ? ("confirmed" as const)
      : ("dismissed" as const);
}
