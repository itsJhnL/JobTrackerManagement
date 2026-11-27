/**
 * Inbox notifications.
 *
 * The Inbox is the hub for everything that happens in a job search. It has two
 * sources, shown as one list:
 *  - emails from recruiters and employers awaiting review (`email_messages`);
 *  - notifications about the applications themselves: status changes, offers,
 *    hires, interviews (`activities` rows of the types below).
 *
 * Notifications reuse the activity log instead of a new table: an activity is
 * already written exactly once per event by the server. What makes one a
 * notification lives in its `metadata`:
 *   notify     true for rows written since notifications exist; only these can be unread
 *   read_at    when it was read (absent = unread)
 *   dismissed_at  removed from the Inbox by the user (the activity itself stays)
 *   actor      "you" (you did it in the app) or "sync" (found in Gmail/Calendar)
 * Older activity rows have none of these and show as already-read history.
 *
 * Job alerts never reach this list: they are filtered when email is synced.
 * Direct conversations stay under an application's Communication → Messages.
 * Pure and unit tested.
 */

import type { EmailKind } from "@/lib/ai/types";
import {
  APPLICATION_STATUS_LABELS,
  type ActivityType,
  type ApplicationStatus,
} from "@/lib/constants";

export const INBOX_CATEGORIES = [
  "recruitment",
  "applications",
  "interviews",
  "offers",
  "hiring",
] as const;
export type InboxCategory = (typeof INBOX_CATEGORIES)[number];

export const INBOX_CATEGORY_LABELS: Record<InboxCategory, string> = {
  recruitment: "Recruitment",
  applications: "Applications",
  interviews: "Interviews",
  offers: "Offers",
  hiring: "Hiring",
};

/** Activity types that are shown in the Inbox. */
export const NOTIFICATION_ACTIVITY_TYPES: readonly ActivityType[] = [
  "status_changed",
  "interview_scheduled",
  "interview_updated",
  "assessment_added",
  "application_created",
];

export const NOTIFY_KEY = "notify";
export const NOTIFICATION_READ_KEY = "read_at";
export const NOTIFICATION_DISMISSED_KEY = "dismissed_at";

export type NotificationActor = "you" | "sync";

/** Statuses worth an unread notification even when you set them yourself. */
export const MILESTONE_STATUSES: readonly ApplicationStatus[] = ["offer", "hired"];

export function categoryForStatus(status: ApplicationStatus): InboxCategory {
  if (status === "hired" || status === "on_hold") return "hiring";
  if (status === "offer") return "offers";
  if (status === "interview" || status === "assessment") return "interviews";
  return "applications";
}

export function categoryForEmailKind(kind: EmailKind | string | null): InboxCategory {
  switch (kind) {
    case "interview_invitation":
    case "interview_reschedule":
      return "interviews";
    case "job_offer":
      return "offers";
    case "rejection":
    case "application_confirmation":
      return "applications";
    default:
      return "recruitment";
  }
}

type Metadata = Record<string, unknown> | null | undefined;

function statusFrom(metadata: Metadata): ApplicationStatus | null {
  const to = metadata?.to ?? metadata?.status;
  return typeof to === "string" && to in APPLICATION_STATUS_LABELS
    ? (to as ApplicationStatus)
    : null;
}

export function categoryForActivity(
  type: ActivityType | string,
  metadata: Metadata,
): InboxCategory {
  if (type === "status_changed") {
    const status = statusFrom(metadata);
    return status ? categoryForStatus(status) : "applications";
  }
  if (
    type === "interview_scheduled" ||
    type === "interview_updated" ||
    type === "assessment_added"
  )
    return "interviews";
  return "applications";
}

/** Which tab of the application page a notification opens. */
export function notificationHref(
  type: ActivityType | string,
  applicationId: string | null,
): string {
  if (!applicationId) return "/applications";
  if (type === "interview_scheduled" || type === "interview_updated")
    return `/applications/${applicationId}?tab=interviews`;
  if (type === "assessment_added") return `/applications/${applicationId}?tab=tasks`;
  return `/applications/${applicationId}`;
}

export function isNotificationUnread(metadata: Metadata) {
  return (
    metadata?.[NOTIFY_KEY] === true &&
    !metadata?.[NOTIFICATION_READ_KEY] &&
    !metadata?.[NOTIFICATION_DISMISSED_KEY]
  );
}

export function isNotificationDismissed(metadata: Metadata) {
  return !!metadata?.[NOTIFICATION_DISMISSED_KEY];
}

/**
 * Metadata that turns an activity into an Inbox notification.
 * Things found by a sync arrive unread. Things you just did yourself arrive
 * read (you already know), except milestones: an offer or a hire is worth
 * seeing in the Inbox either way.
 */
export function notificationMetadata(
  actor: NotificationActor,
  options: { status?: ApplicationStatus; now?: Date; unread?: boolean } = {},
): Record<string, string | boolean> {
  const unread =
    options.unread ??
    (actor === "sync" ||
      (!!options.status && MILESTONE_STATUSES.includes(options.status)));
  return {
    [NOTIFY_KEY]: true,
    actor,
    ...(unread
      ? {}
      : { [NOTIFICATION_READ_KEY]: (options.now ?? new Date()).toISOString() }),
  };
}

/** Title for a status change, written from the job seeker's side. */
export function statusChangeTitle(company: string, status: ApplicationStatus) {
  switch (status) {
    case "hired":
      return `You're hired at ${company}`;
    case "offer":
      return `Offer from ${company}`;
    case "on_hold":
      return `${company} put you on hold`;
    case "rejected":
      return `${company} did not move forward`;
    default:
      return `${company} moved to ${APPLICATION_STATUS_LABELS[status]}`;
  }
}

/** One line under the title. */
export function notificationDescription(
  type: ActivityType | string,
  metadata: Metadata,
): string {
  if (type === "status_changed") {
    const to = statusFrom(metadata);
    const from = metadata?.from;
    const fromLabel =
      typeof from === "string" && from in APPLICATION_STATUS_LABELS
        ? APPLICATION_STATUS_LABELS[from as ApplicationStatus]
        : null;
    if (to && fromLabel)
      return `Status changed from ${fromLabel} to ${APPLICATION_STATUS_LABELS[to]}`;
    if (to) return `Status is now ${APPLICATION_STATUS_LABELS[to]}`;
    return "Status changed";
  }
  if (type === "interview_scheduled") return "Interview added";
  if (type === "interview_updated") return "Interview updated";
  if (type === "assessment_added") return "Assessment added";
  if (type === "application_created") return "Application saved";
  return "";
}
