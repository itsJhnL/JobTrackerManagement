"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NAV_GROUPS, isActivePath } from "@/lib/navigation";

import { UserMenu, type UserMenuProps } from "./user-menu";

interface AppSidebarProps {
  user: UserMenuProps["user"];
  /** Badge counts keyed by href, e.g. { "/follow-ups": 3 }. */
  badges?: Record<string, number>;
}

const BADGE_LABELS: Record<string, string> = {
  "/inbox": "unread",
  "/follow-ups": "due",
};

export function AppSidebar({ user, badges = {} }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3 group-data-[collapsible=icon]:px-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BriefcaseBusiness className="size-3.5" />
          </span>
          <span className="truncate font-heading text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Job Tracker
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const count = badges[item.href];
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.title}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      {count ? (
                        <SidebarMenuBadge
                          aria-label={`${count} ${BADGE_LABELS[item.href] ?? "new"}`}
                          className={cn(
                            item.href === "/inbox"
                              ? "bg-primary text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-active/menu-button:text-primary-foreground"
                              : "bg-rose-500/10 text-rose-600 peer-hover/menu-button:text-rose-600 peer-data-active/menu-button:text-rose-600 dark:text-rose-300 dark:peer-hover/menu-button:text-rose-300 dark:peer-data-active/menu-button:text-rose-300",
                          )}
                        >
                          {count > 99 ? "99+" : count}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
