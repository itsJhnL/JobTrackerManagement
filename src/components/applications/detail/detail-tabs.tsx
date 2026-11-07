"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DETAIL_TABS, parseDetailTab, type DetailTab } from "@/lib/tabs";

const LABELS: Record<DetailTab, string> = {
  overview: "Overview",
  application: "Application",
  compensation: "Compensation",
  communication: "Communication",
  interviews: "Interviews",
  tasks: "Tasks",
  activity: "Activity",
};

interface DetailTabsProps {
  initialTab: DetailTab;
  counts?: Partial<Record<DetailTab, number>>;
  panels: Record<DetailTab, React.ReactNode>;
}

/** URL-synced tabs (?tab=…) so links from the dashboard land on the right panel. */
export function DetailTabs({ initialTab, counts, panels }: DetailTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = searchParams.get("tab");
  const value = param ? parseDetailTab(param) : initialTab;

  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        const params = new URLSearchParams(searchParams.toString());
        if (v === "overview") params.delete("tab");
        else params.set("tab", String(v));
        router.replace(`${pathname}${params.size ? `?${params}` : ""}`, {
          scroll: false,
        });
      }}
      className="gap-4"
    >
      <div className="-mx-4 scrollbar-thin overflow-x-auto px-4 md:-mx-6 md:px-6">
        <TabsList variant="line" className="h-9 w-max gap-2 border-b pb-0">
          {DETAIL_TABS.map((t) => (
            <TabsTrigger key={t} value={t} className="h-8 px-2 pb-2.5">
              {LABELS[t]}
              {counts?.[t] ? (
                <span className="ml-1 rounded-sm bg-muted px-1 text-[10px] text-muted-foreground tabular-nums">
                  {counts[t]}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {DETAIL_TABS.map((t) => (
        <TabsContent key={t} value={t}>
          {panels[t]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
