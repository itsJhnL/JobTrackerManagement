"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Link2, Mail, Phone, Plus, Users } from "lucide-react";

import { deleteContact } from "@/actions/contacts";
import { SearchInput } from "@/components/applications/table/toolbar";
import type { ApplicationOption } from "@/components/interviews/interview-form";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityMenu } from "@/components/shared/entity-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ContactWithApplication } from "@/lib/data/contacts";
import { initials } from "@/lib/format";

import { ContactFormDialog } from "./contact-form";

interface ContactsViewProps {
  contacts: ContactWithApplication[];
  applications: ApplicationOption[];
}

export function ContactsView({ contacts, applications }: ContactsViewProps) {
  const [dialog, setDialog] = useState<{
    open: boolean;
    contact?: ContactWithApplication;
  }>({ open: false });
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [
        c.name,
        c.role,
        c.company,
        c.email,
        c.application?.company_name,
        c.application?.job_title,
      ].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [contacts, query]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search contacts…" />
        <Button size="sm" onClick={() => setDialog({ open: true })}>
          <Plus data-icon="inline-start" /> Add contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Keep recruiters, hiring managers and referrals attached to the applications they belong to."
          action={<Button onClick={() => setDialog({ open: true })}>Add contact</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No matches"
          description="Try a different search."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} size="sm" className="gap-3">
              <div className="flex items-start gap-3 px-3">
                <Avatar className="size-9">
                  <AvatarFallback className="text-xs">{initials(c.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.role, c.company ?? c.application?.company_name]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <EntityMenu
                  onEdit={() => setDialog({ open: true, contact: c })}
                  onDelete={() => deleteContact(c.id)}
                  deleteTitle={`Remove ${c.name}?`}
                />
              </div>
              <div className="flex flex-col gap-1 px-3 text-xs text-muted-foreground">
                {c.email ? (
                  <a
                    href={`mailto:${c.email}`}
                    className="inline-flex items-center gap-1.5 truncate hover:text-foreground"
                  >
                    <Mail className="size-3" /> {c.email}
                  </a>
                ) : null}
                {c.phone ? (
                  <a
                    href={`tel:${c.phone}`}
                    className="inline-flex items-center gap-1.5 hover:text-foreground"
                  >
                    <Phone className="size-3" /> {c.phone}
                  </a>
                ) : null}
                {c.linkedin_url ? (
                  <a
                    href={c.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-foreground"
                  >
                    <Link2 className="size-3" /> LinkedIn
                  </a>
                ) : null}
              </div>
              {c.application ? (
                <div className="border-t px-3 pt-2 text-xs">
                  <Link
                    href={`/applications/${c.application.id}?tab=communication`}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {c.application.company_name} · {c.application.job_title}
                  </Link>
                </div>
              ) : null}
              {c.notes ? (
                <p className="line-clamp-2 px-3 text-xs text-muted-foreground">
                  {c.notes}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <ContactFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        applicationId={dialog.contact?.application_id ?? null}
        applications={applications}
        contact={dialog.contact}
      />
    </>
  );
}
