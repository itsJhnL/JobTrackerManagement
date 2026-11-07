import type { Metadata } from "next";

import { AccountSection } from "@/components/settings/account-section";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { ProfileForm } from "@/components/settings/profile-form";
import {
  SETTINGS_TABS,
  SettingsTabs,
  type SettingsTab,
} from "@/components/settings/settings-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { aiStatus } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/data/profiles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage(props: PageProps<"/settings">) {
  const params = await props.searchParams;
  const tabParam = typeof params.tab === "string" ? params.tab : "profile";
  const initialTab: SettingsTab = (SETTINGS_TABS as readonly string[]).includes(tabParam)
    ? (tabParam as SettingsTab)
    : "profile";

  const user = await requireUser();
  const supabase = await createClient();
  const profile = await getProfile(supabase, user.id);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your verified profile, defaults, and account."
      />
      <SettingsTabs
        initialTab={initialTab}
        panels={{
          profile: <ProfileForm profile={profile} />,
          preferences: <PreferencesForm profile={profile} />,
          account: <AccountSection email={user.email ?? profile.email} ai={aiStatus()} />,
        }}
      />
    </>
  );
}
