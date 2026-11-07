import type { Metadata } from "next";

import { AccountSection } from "@/components/settings/account-section";
import { IntegrationsSection } from "@/components/settings/integrations-section";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { aiStatus } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { getIntegrationSummary } from "@/lib/data/integrations";
import { getProfile } from "@/lib/data/profiles";
import { isEncryptionConfigured } from "@/lib/integrations/google/crypto";
import { googleOAuthStatus } from "@/lib/integrations/google/oauth";
import { parseSettingsTab } from "@/lib/tabs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage(props: PageProps<"/settings">) {
  const params = await props.searchParams;
  const initialTab = parseSettingsTab(params.tab);

  const user = await requireUser();
  const supabase = await createClient();
  const [profile, integrations] = await Promise.all([
    getProfile(supabase, user.id),
    getIntegrationSummary(supabase, user.id),
  ]);
  const ai = aiStatus();
  const oauth = googleOAuthStatus();

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
          integrations: (
            <IntegrationsSection
              summary={integrations}
              oauthConfigured={oauth.configured}
              encryptionConfigured={isEncryptionConfigured()}
              aiConfigured={ai.configured}
              redirectUri={oauth.redirectUri}
              notice={{
                connected:
                  typeof params.connected === "string" ? params.connected : undefined,
                error: typeof params.error === "string" ? params.error : undefined,
              }}
            />
          ),
          account: <AccountSection email={user.email ?? profile.email} ai={ai} />,
        }}
      />
    </>
  );
}
