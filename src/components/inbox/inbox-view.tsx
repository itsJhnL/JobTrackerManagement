"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCheck,
  FileText,
  Handshake,
  Inbox,
  Mail,
  MailOpen,
  PartyPopper,
  RefreshCw,
  Undo2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { dismissEmail, moveEmailToInbox } from "@/actions/integrations";
import {
  dismissNotification,
  markAllInboxRead,
  setInboxRead,
} from "@/actions/notifications";
import { StatusBadge } from "@/components/applications/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { ReviewForm, type ReviewApplication } from "@/components/inbox/review-form";
import {
  startGoogleSync,
  useGoogleSyncStatus,
} from "@/components/integrations/google-sync";
import { ButtonLink } from "@/components/shared/button-link";
import { EmptyState } from "@/components/shared/empty-state";
import { TimeAgo } from "@/components/shared/time-ago";
import { useFormat } from "@/components/timezone-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EmailAnalysis } from "@/lib/ai/types";
import type { EmailMessageWithApplication } from "@/lib/data/integrations";
import type { InboxNotification } from "@/lib/data/notifications";
import { displaySubject, inboxGroup, isEmailUnread, type InboxGroup } from "@/lib/inbox";
import {
  FILTER_CATEGORY_LABELS,
  type FilterCategory,
} from "@/lib/integrations/email-rules";
import {
  INBOX_CATEGORIES,
  INBOX_CATEGORY_LABELS,
  categoryForEmailKind,
  type InboxCategory,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  application_confirmation: "Application received",
  recruiter_response: "Recruiter response",
  interview_invitation: "Interview invitation",
  interview_reschedule: "Interview rescheduled",
  job_offer: "Job offer",
  rejection: "Rejection",
  other_recruiting: "Recruiting",
};

const CATEGORY_STYLES: Record<InboxCategory, string> = {
  recruitment: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  applications: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  interviews: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  offers: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  hiring: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
};

const CATEGORY_ICONS: Record<InboxCategory, LucideIcon> = {
  recruitment: Users,
  applications: FileText,
  interviews: CalendarClock,
  offers: Handshake,
  hiring: PartyPopper,
};

const ARCHIVE_GROUPS = ["handled", "saved", "filtered"] as const;
type ArchiveGroup = (typeof ARCHIVE_GROUPS)[number];

const GROUP_LABELS: Record<ArchiveGroup, string> = {
  handled: "Handled",
  saved: "Saved to Applications",
  filtered: "Filtered",
};

const GROUP_EMPTY: Record<ArchiveGroup, string> = {
  handled: "No handled emails yet",
  saved: "No application confirmations yet",
  filtered: "Nothing filtered",
};

const GROUP_HINTS: Record<ArchiveGroup, string> = {
  handled: "Emails you reviewed and confirmed.",
  saved:
    "Automatic “application received” emails, such as Indeed confirmations. Each one was saved to its application, so it stays out of your Inbox.",
  filtered:
    "Job alerts, promotions, your own sent mail and emails you dismissed. Nothing here is deleted; move anything that matters back to your Inbox.",
};

/** Items rendered at first; the rest load with "Show more". */
const PAGE_SIZE = 40;

/** `extracted` as stored by the sync: the AI analysis plus routing facts. */
type RoutedExtract = Partial<EmailAnalysis> & {
  category?: string | null;
  route_reason?: string | null;
};

/** One row in the Inbox: an email awaiting review or a notification. */
type InboxItem =
  | {
      key: string;
      source: "email";
      category: InboxCategory;
      at: string;
      unread: boolean;
      email: EmailMessageWithApplication;
    }
  | {
      key: string;
      source: "notification";
      category: InboxCategory;
      at: string;
      unread: boolean;
      notification: InboxNotification;
    };

interface InboxViewProps {
  emails: EmailMessageWithApplication[];
  notifications: InboxNotification[];
  applications: ReviewApplication[];
  gmailReady: boolean;
  lastGmailSyncAt: string | null;
  calendarReady: boolean;
}

export function InboxView({
  emails,
  notifications,
  applications,
  gmailReady,
  calendarReady,
  lastGmailSyncAt,
}: InboxViewProps) {
  const router = useRouter();
  const fmt = useFormat();
  const [pending, start] = useTransition();
  const [review, setReview] = useState<EmailMessageWithApplication | null>(null);
  const [category, setCategory] = useState<InboxCategory | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  // Read state and removals apply instantly; the server catches up and wins on refresh.
  const [readOverride, setReadOverride] = useState<Record<string, boolean>>({});
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const syncing = useGoogleSyncStatus().gmail;

  const { items, archive } = useMemo(() => {
    const archive: Record<ArchiveGroup, EmailMessageWithApplication[]> = {
      handled: [],
      saved: [],
      filtered: [],
    };
    const items: InboxItem[] = [];
    for (const e of emails) {
      const group: InboxGroup = inboxGroup(e);
      if (group !== "review") {
        archive[group].push(e);
        continue;
      }
      items.push({
        key: `email:${e.id}`,
        source: "email",
        category: categoryForEmailKind(e.classification),
        at: e.received_at ?? e.created_at,
        unread: isEmailUnread(e),
        email: e,
      });
    }
    for (const n of notifications)
      items.push({
        key: `notification:${n.id}`,
        source: "notification",
        category: n.category,
        at: n.at,
        unread: n.unread,
        notification: n,
      });
    items.sort((a, b) => b.at.localeCompare(a.at));
    return { items, archive };
  }, [emails, notifications]);

  const isUnread = (i: InboxItem) => readOverride[i.key] ?? i.unread;
  const live = items.filter((i) => !removed.has(i.key));
  const unreadCount = live.filter(isUnread).length;
  const counts = Object.fromEntries(
    INBOX_CATEGORIES.map((c) => [c, live.filter((i) => i.category === c).length]),
  ) as Record<InboxCategory, number>;
  const visible = live.filter(
    (i) =>
      (category === "all" || i.category === category) && (!unreadOnly || isUnread(i)),
  );

  const setRead = (targets: InboxItem[], read: boolean) => {
    if (targets.length === 0) return;
    const previous = readOverride;
    setReadOverride((prev) => ({
      ...prev,
      ...Object.fromEntries(targets.map((t) => [t.key, !read])),
    }));
    void setInboxRead({
      emails: targets.filter((t) => t.source === "email").map((t) => t.email.id),
      notifications: targets
        .filter((t) => t.source === "notification")
        .map((t) => t.notification.id),
      read,
    }).then((r) => {
      if (!r.ok) {
        setReadOverride(previous);
        toast.error(r.error);
      } else router.refresh();
    });
  };

  const markAllRead = () => {
    const targets = live.filter(isUnread);
    const previous = readOverride;
    setReadOverride((prev) => ({
      ...prev,
      ...Object.fromEntries(targets.map((t) => [t.key, false])),
    }));
    void markAllInboxRead().then((r) => {
      if (!r.ok) {
        setReadOverride(previous);
        toast.error(r.error);
      } else router.refresh();
    });
  };

  const remove = (item: InboxItem) => {
    setRemoved((prev) => new Set(prev).add(item.key));
    start(async () => {
      const r =
        item.source === "email"
          ? await dismissEmail(item.email.id)
          : await dismissNotification(item.notification.id);
      if (!r.ok) {
        setRemoved((prev) => {
          const next = new Set(prev);
          next.delete(item.key);
          return next;
        });
        toast.error(r.error);
      } else router.refresh();
    });
  };

  const restore = (id: string) =>
    start(async () => {
      const r = await moveEmailToInbox(id);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Moved to your Inbox");
        router.refresh();
      }
    });

  const openReview = (item: Extract<InboxItem, { source: "email" }>) => {
    setReview(item.email);
    if (isUnread(item)) setRead([item], true);
  };

  const sync = () => startGoogleSync("gmail", () => router.refresh());

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {unreadCount > 0
            ? `${unreadCount} unread of ${live.length}.`
            : live.length > 0
              ? "You're all caught up."
              : "Nothing here yet."}{" "}
          {gmailReady
            ? "Emails are only linked or scheduled after you review them."
            : "Connect Gmail to bring in recruiter emails automatically."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {gmailReady ? (
            <>
              <span className="text-xs text-muted-foreground">
                Auto-sync on · last synced{" "}
                {lastGmailSyncAt ? <TimeAgo value={lastGmailSyncAt} /> : "never"}
              </span>
              <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
                <RefreshCw className={cn(syncing && "animate-spin")} />{" "}
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            </>
          ) : (
            <ButtonLink href="/settings?tab=integrations" size="sm">
              Connect Gmail
            </ButtonLink>
          )}
        </div>
      </div>

      <Tabs defaultValue="inbox" className="gap-4">
        <TabsList
          variant="line"
          className="h-9 w-full justify-start gap-2 overflow-x-auto border-b pb-0"
        >
          <TabsTrigger value="inbox" className="h-8 flex-none px-2 pb-2.5">
            Inbox
            <span
              className={cn(
                "ml-1 rounded-sm px-1 text-[10px] tabular-nums",
                unreadCount > 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
              aria-label={`${unreadCount} unread`}
            >
              {unreadCount}
            </span>
          </TabsTrigger>
          {ARCHIVE_GROUPS.map((k) => (
            <TabsTrigger key={k} value={k} className="h-8 flex-none px-2 pb-2.5">
              {GROUP_LABELS[k]}
              <span className="ml-1 rounded-sm bg-muted px-1 text-[10px] text-muted-foreground tabular-nums">
                {archive[k].length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="inbox" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Filter by category"
              className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 py-0.5"
            >
              <CategoryChip
                label="All"
                count={live.length}
                active={category === "all"}
                onClick={() => {
                  setCategory("all");
                  setShown(PAGE_SIZE);
                }}
              />
              {INBOX_CATEGORIES.map((c) => (
                <CategoryChip
                  key={c}
                  label={INBOX_CATEGORY_LABELS[c]}
                  count={counts[c]}
                  active={category === c}
                  onClick={() => {
                    setCategory(c);
                    setShown(PAGE_SIZE);
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={unreadOnly ? "secondary" : "ghost"}
                aria-pressed={unreadOnly}
                onClick={() => setUnreadOnly((v) => !v)}
              >
                Unread only
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={markAllRead}
                disabled={unreadCount === 0}
              >
                <CheckCheck /> Mark all as read
              </Button>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={
                live.length === 0
                  ? "Your Inbox is empty"
                  : unreadOnly
                    ? "No unread items"
                    : `Nothing under ${category === "all" ? "All" : INBOX_CATEGORY_LABELS[category]}`
              }
              description={
                live.length === 0
                  ? "Recruiter emails, interview invitations, offers, hires and status updates will appear here. Job alerts are filtered out."
                  : "Try another category, or turn off “Unread only”."
              }
            />
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border">
              {visible.slice(0, shown).map((item) => {
                const unread = isUnread(item);
                const Icon = CATEGORY_ICONS[item.category];
                const app =
                  item.source === "email"
                    ? item.email.application
                    : item.notification.application;
                const x =
                  item.source === "email"
                    ? (item.email.extracted as RoutedExtract | null)
                    : null;
                const title =
                  item.source === "email"
                    ? displaySubject(item.email.subject)
                    : item.notification.title;
                return (
                  <li
                    key={item.key}
                    data-unread={unread || undefined}
                    data-source={item.source}
                    data-category={item.category}
                    className="flex flex-col gap-2 px-3 py-3 data-unread:bg-primary/[0.03] sm:flex-row sm:items-start sm:px-4"
                  >
                    <div className="flex min-w-0 flex-1 gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                          CATEGORY_STYLES[item.category],
                        )}
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {unread ? (
                            <span
                              className="size-2 shrink-0 rounded-full bg-primary"
                              aria-label="Unread"
                            />
                          ) : null}
                          {item.source === "notification" ? (
                            <Link
                              href={item.notification.href}
                              onClick={() => unread && setRead([item], true)}
                              className={cn(
                                "min-w-0 truncate hover:underline",
                                unread ? "font-semibold" : "font-medium",
                              )}
                            >
                              {title}
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openReview(item)}
                              className={cn(
                                "min-w-0 truncate text-left hover:underline",
                                unread ? "font-semibold" : "font-medium",
                              )}
                            >
                              {title}
                            </button>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              "border-transparent",
                              CATEGORY_STYLES[item.category],
                            )}
                          >
                            {item.source === "email"
                              ? (KIND_LABELS[
                                  item.email.classification ?? "other_recruiting"
                                ] ?? INBOX_CATEGORY_LABELS[item.category])
                              : INBOX_CATEGORY_LABELS[item.category]}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.source === "email"
                            ? `${item.email.from_name ?? item.email.from_email ?? "Email"} · `
                            : item.notification.actor === "sync"
                              ? "Found by sync · "
                              : ""}
                          {fmt.dateTime(item.at)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.source === "email"
                            ? (x?.summary ?? item.email.snippet)
                            : item.notification.description}
                        </p>
                        <p className="mt-1 text-xs">
                          {app ? (
                            <Link
                              href={`/applications/${app.id}`}
                              className="inline-flex flex-wrap items-center gap-1 hover:underline"
                            >
                              <BriefcaseBusiness className="size-3" /> {app.company_name}{" "}
                              · {app.job_title} <StatusBadge status={app.status} />
                            </Link>
                          ) : item.source === "email" ? (
                            <span className="text-amber-700 dark:text-amber-300">
                              Not matched to an application yet
                            </span>
                          ) : null}
                        </p>
                        {x?.route_reason ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {x.route_reason}
                          </p>
                        ) : null}
                        {x?.interview_start ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Proposed: {fmt.dateTime(x.interview_start)}
                            {x.interview_platform ? ` · ${x.interview_platform}` : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
                      {item.source === "email" ? (
                        <Button
                          size="sm"
                          onClick={() => openReview(item)}
                          disabled={pending}
                        >
                          <Check /> Review
                        </Button>
                      ) : (
                        <ButtonLink
                          href={item.notification.href}
                          size="sm"
                          variant="outline"
                          onClick={() => unread && setRead([item], true)}
                        >
                          Open <ArrowRight />
                        </ButtonLink>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setRead([item], unread)}
                        aria-label={unread ? "Mark as read" : "Mark as unread"}
                        title={unread ? "Mark as read" : "Mark as unread"}
                      >
                        {unread ? <MailOpen /> : <Mail />}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => remove(item)}
                        disabled={pending}
                        aria-label={item.source === "email" ? "Dismiss" : "Remove"}
                        title={
                          item.source === "email"
                            ? "Dismiss (moves to Filtered)"
                            : "Remove from Inbox"
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {visible.length > shown ? (
            <Button
              variant="outline"
              size="sm"
              className="self-center"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, visible.length - shown)} more
            </Button>
          ) : null}
        </TabsContent>

        {ARCHIVE_GROUPS.map((k) => (
          <TabsContent key={k} value={k}>
            {archive[k].length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={GROUP_EMPTY[k]}
                description={GROUP_HINTS[k]}
              />
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">{GROUP_HINTS[k]}</p>
                <ul className="flex flex-col divide-y rounded-xl border">
                  {archive[k].map((e) => {
                    const x = e.extracted as RoutedExtract | null;
                    const filterCategory = (x?.category ?? null) as FilterCategory | null;
                    return (
                      <li
                        key={e.id}
                        className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:px-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "border-transparent",
                                k === "filtered"
                                  ? "bg-muted text-muted-foreground"
                                  : CATEGORY_STYLES[
                                      categoryForEmailKind(e.classification)
                                    ],
                              )}
                            >
                              {k === "filtered"
                                ? filterCategory
                                  ? FILTER_CATEGORY_LABELS[filterCategory]
                                  : "Dismissed by you"
                                : (KIND_LABELS[e.classification ?? "other_recruiting"] ??
                                  e.classification)}
                            </Badge>
                            <span className="truncate font-medium">
                              {displaySubject(e.subject)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {e.from_name ?? e.from_email} · {fmt.dateTime(e.received_at)}
                          </p>
                          {x?.summary ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {x.summary}
                            </p>
                          ) : null}
                          {e.application ? (
                            <p className="mt-1 text-xs">
                              <Link
                                href={`/applications/${e.application.id}`}
                                className="inline-flex flex-wrap items-center gap-1 hover:underline"
                              >
                                <BriefcaseBusiness className="size-3" />{" "}
                                {e.application.company_name} · {e.application.job_title}{" "}
                                <StatusBadge status={e.application.status} />
                              </Link>
                            </p>
                          ) : null}
                          {x?.route_reason && k !== "handled" ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {x.route_reason}
                            </p>
                          ) : null}
                        </div>
                        {k !== "handled" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 self-end sm:self-start"
                            onClick={() => restore(e.id)}
                            disabled={pending}
                          >
                            <Undo2 /> Move to Inbox
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <FormDialog
        open={!!review}
        onOpenChange={(o) => !o && setReview(null)}
        title="Review detected email"
        description="Check what was extracted, pick the application, and decide what to save. Nothing is sent to the sender."
        className="sm:max-w-xl"
      >
        {review ? (
          <ReviewForm
            email={review}
            applications={applications}
            calendarReady={calendarReady}
            onDone={() => setReview(null)}
          />
        ) : null}
      </FormDialog>
    </>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "secondary" : "ghost"}
      aria-pressed={active}
      onClick={onClick}
      className="shrink-0"
    >
      {label}
      <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
    </Button>
  );
}
