import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette, type SearchableApplication } from "./command-palette";
import { Notifications, type NotificationItem } from "./notifications";
import { QuickAddButton } from "@/components/applications/quick-add-button";
import { ThemeToggle } from "./theme-toggle";

interface AppHeaderProps {
  applications: SearchableApplication[];
  notifications: NotificationItem[];
}

export function AppHeader({ applications, notifications }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-backdrop-filter:bg-background/60 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-[orientation=vertical]:h-4"
      />
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="hidden sm:block">
          <CommandPalette applications={applications} />
        </div>
        <Notifications items={notifications} />
        <ThemeToggle />
        <QuickAddButton />
      </div>
    </header>
  );
}
