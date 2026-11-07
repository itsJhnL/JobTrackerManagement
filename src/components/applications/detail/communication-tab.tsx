"use client";

import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  Link2,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Users,
} from "lucide-react";

import { deleteCommunication } from "@/actions/communications";
import { deleteContact } from "@/actions/contacts";
import { CommunicationFormDialog } from "@/components/communications/communication-form";
import { ContactFormDialog } from "@/components/contacts/contact-form";
import { FollowUpActions } from "@/components/follow-ups/follow-up-actions";
import { FollowUpFormDialog } from "@/components/follow-ups/follow-up-form";
import { EmptyState } from "@/components/shared/empty-state";
import { useFormat } from "@/components/timezone-provider";
import { EntityMenu } from "@/components/shared/entity-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  COMMUNICATION_TYPE_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  PRIORITY_STYLES,
} from "@/lib/constants";
import { bucketFollowUp } from "@/lib/follow-ups";
import type {
  CommunicationRow,
  ContactRow,
  FollowUpRow,
} from "@/lib/supabase/database.types";
import { formatRelativeDay, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Section } from "./section";

interface CommunicationTabProps {
  applicationId: string;
  companyName: string;
  contacts: ContactRow[];
  communications: CommunicationRow[];
  followUps: FollowUpRow[];
}

export function CommunicationTab({
  applicationId,
  companyName,
  contacts,
  communications,
  followUps,
}: CommunicationTabProps) {
  const fmt = useFormat();
  const [contactDialog, setContactDialog] = useState<{
    open: boolean;
    contact?: ContactRow;
  }>({ open: false });
  const [messageDialog, setMessageDialog] = useState<{
    open: boolean;
    communication?: CommunicationRow;
    initialMessage?: string;
    initialSubject?: string;
  }>({ open: false });
  const [followUpDialog, setFollowUpDialog] = useState<{
    open: boolean;
    followUp?: FollowUpRow;
  }>({ open: false });

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const open = followUps.filter((f) => f.status === "pending" || f.status === "snoozed");
  const closed = followUps.filter(
    (f) => f.status === "completed" || f.status === "cancelled",
  );

  return (
    <div className="grid gap-4 *:min-w-0 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Section
          title="Follow-ups"
          description="Reminders with optional drafts. Nothing is sent automatically."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFollowUpDialog({ open: true })}
            >
              <Plus data-icon="inline-start" /> Schedule
            </Button>
          }
        >
          {followUps.length === 0 ? (
            <EmptyState
              size="sm"
              icon={BellRing}
              title="No follow-ups yet"
              description="Schedule one so this application doesn't go quiet."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {open.length > 0 ? (
                <FollowUpList
                  items={open}
                  onEdit={(f) => setFollowUpDialog({ open: true, followUp: f })}
                  onUseDraft={(f) =>
                    setMessageDialog({
                      open: true,
                      initialMessage: f.message_draft ?? "",
                      initialSubject: f.title ?? "",
                    })
                  }
                />
              ) : null}
              {closed.length > 0 ? (
                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
                    {closed.length} completed or cancelled
                  </summary>
                  <div className="mt-2">
                    <FollowUpList
                      items={closed}
                      muted
                      onEdit={(f) => setFollowUpDialog({ open: true, followUp: f })}
                    />
                  </div>
                </details>
              ) : null}
            </div>
          )}
        </Section>

        <Section
          title="Messages"
          description="Email and message history with this employer."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMessageDialog({ open: true })}
            >
              <Plus data-icon="inline-start" /> Log message
            </Button>
          }
        >
          {communications.length === 0 ? (
            <EmptyState
              size="sm"
              icon={MessageSquare}
              title="No messages logged"
              description="Record emails and replies so the history stays in one place."
            />
          ) : (
            <ol className="flex flex-col gap-3">
              {communications.map((m) => {
                const contact = m.contact_id ? contactById.get(m.contact_id) : null;
                const inbound = m.direction === "inbound";
                return (
                  <li
                    key={m.id}
                    className={cn("rounded-lg border p-3", inbound && "bg-muted/30")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2 text-sm">
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full",
                            inbound
                              ? "bg-sky-500/10 text-sky-600 dark:text-sky-300"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {inbound ? (
                            <ArrowDownLeft className="size-3.5" />
                          ) : (
                            <ArrowUpRight className="size-3.5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {m.subject || COMMUNICATION_TYPE_LABELS[m.communication_type]}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {inbound ? "From" : "To"} {contact?.name ?? companyName} ·{" "}
                            {COMMUNICATION_TYPE_LABELS[m.communication_type]} ·{" "}
                            {fmt.dateTime(m.communication_date)}
                          </p>
                        </div>
                      </div>
                      <EntityMenu
                        onEdit={() => setMessageDialog({ open: true, communication: m })}
                        onDelete={() => deleteCommunication(m.id)}
                        deleteTitle="Delete this message?"
                      />
                    </div>
                    {m.message ? (
                      <p className="mt-2 line-clamp-6 text-sm whitespace-pre-wrap text-muted-foreground">
                        {m.message}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      </div>

      <div className="flex flex-col gap-4">
        <Section
          title="Contacts"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setContactDialog({ open: true })}
            >
              <Plus data-icon="inline-start" /> Add
            </Button>
          }
        >
          {contacts.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Users}
              title="No contacts"
              description="Add the recruiter or hiring manager."
            />
          ) : (
            <ul className="flex flex-col divide-y">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">
                      {initials(c.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium">{c.name}</p>
                    {c.role ? (
                      <p className="truncate text-xs text-muted-foreground">{c.role}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <Mail className="size-3" /> {c.email}
                        </a>
                      ) : null}
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone}`}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <Phone className="size-3" /> {c.phone}
                        </a>
                      ) : null}
                      {c.linkedin_url ? (
                        <a
                          href={c.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <Link2 className="size-3" /> LinkedIn
                        </a>
                      ) : null}
                    </div>
                    {c.notes ? (
                      <p className="mt-1 text-xs text-muted-foreground">{c.notes}</p>
                    ) : null}
                  </div>
                  <EntityMenu
                    onEdit={() => setContactDialog({ open: true, contact: c })}
                    onDelete={() => deleteContact(c.id)}
                    deleteTitle={`Remove ${c.name}?`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <ContactFormDialog
        open={contactDialog.open}
        onOpenChange={(o) => setContactDialog((s) => ({ ...s, open: o }))}
        applicationId={applicationId}
        contact={contactDialog.contact}
        defaultCompany={companyName}
      />
      <CommunicationFormDialog
        open={messageDialog.open}
        onOpenChange={(o) => setMessageDialog((s) => ({ ...s, open: o }))}
        applicationId={applicationId}
        contacts={contacts}
        communication={messageDialog.communication}
        initialMessage={messageDialog.initialMessage}
        initialSubject={messageDialog.initialSubject}
      />
      <FollowUpFormDialog
        open={followUpDialog.open}
        onOpenChange={(o) => setFollowUpDialog((s) => ({ ...s, open: o }))}
        applicationId={applicationId}
        followUp={followUpDialog.followUp}
      />
    </div>
  );
}

function FollowUpList({
  items,
  muted,
  onEdit,
  onUseDraft,
}: {
  items: FollowUpRow[];
  muted?: boolean;
  onEdit: (f: FollowUpRow) => void;
  onUseDraft?: (f: FollowUpRow) => void;
}) {
  return (
    <ul className={cn("flex flex-col divide-y rounded-lg border", muted && "opacity-70")}>
      {items.map((f) => {
        const bucket = bucketFollowUp(f);
        return (
          <li key={f.id} className="flex flex-col gap-2 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">
                  {f.title ?? FOLLOW_UP_TYPE_LABELS[f.follow_up_type]}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className={PRIORITY_STYLES[f.priority]}>{f.priority}</span>
                  <span>{FOLLOW_UP_TYPE_LABELS[f.follow_up_type]}</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      bucket === "overdue" &&
                        "font-medium text-rose-600 dark:text-rose-400",
                      bucket === "today" &&
                        "font-medium text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {bucket === "snoozed"
                      ? `Snoozed until ${formatRelativeDay(f.snoozed_until)}`
                      : `Due ${formatRelativeDay(f.due_date)}`}
                  </span>
                  {f.follow_up_count > 0 ? <span>· #{f.follow_up_count + 1}</span> : null}
                  {f.status !== "pending" ? (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      {FOLLOW_UP_STATUS_LABELS[f.status]}
                    </Badge>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <FollowUpActions
                  id={f.id}
                  status={f.status}
                  compact
                  onEdit={() => onEdit(f)}
                />
              </div>
            </div>
            {f.message_draft ? (
              <div className="rounded-md bg-muted/50 p-2 text-xs">
                <p className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">
                  {f.message_draft}
                </p>
                {onUseDraft ? (
                  <button
                    type="button"
                    onClick={() => onUseDraft(f)}
                    className="mt-1 font-medium underline-offset-4 hover:underline"
                  >
                    Log this as a sent message
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
