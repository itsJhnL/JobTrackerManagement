"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const SETTINGS_TABS = [
  "profile",
  "preferences",
  "integrations",
  "account",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

const LABELS: Record<SettingsTab, string> = {
  profile: "Profile",
  preferences: "Preferences",
  integrations: "Integrations",
  account: "Account",
};

export function SettingsTabs({
  initialTab,
  panels,
}: {
  initialTab: SettingsTab;
  panels: Record<SettingsTab, React.ReactNode>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = searchParams.get("tab") as SettingsTab | null;
  const value = param && SETTINGS_TABS.includes(param) ? param : initialTab;

  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", String(v));
        router.replace(`${pathname}?${params}`, { scroll: false });
      }}
      className="gap-6"
    >
      <TabsList variant="line" className="h-9 w-max gap-2 border-b pb-0">
        {SETTINGS_TABS.map((t) => (
          <TabsTrigger key={t} value={t} className="h-8 px-2 pb-2.5">
            {LABELS[t]}
          </TabsTrigger>
        ))}
      </TabsList>
      {SETTINGS_TABS.map((t) => (
        <TabsContent key={t} value={t}>
          {panels[t]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
