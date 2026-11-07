import type { Metadata } from "next";

import { ContactsView } from "@/components/contacts/contacts-view";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth";
import { listApplicationsForSearch } from "@/lib/data/applications";
import { listContacts } from "@/lib/data/contacts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [contacts, applications] = await Promise.all([
    listContacts(supabase, user.id),
    listApplicationsForSearch(supabase, user.id),
  ]);

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Recruiters, hiring managers and referrals."
      />
      <ContactsView contacts={contacts} applications={applications} />
    </>
  );
}
