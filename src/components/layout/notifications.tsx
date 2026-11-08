"use client";

import Link from "next/link";
import { Bell, CalendarClock, ClipboardList, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  kind: "follow_up" | "interview" | "assessment" | "email";
  title: string;
  subtitle: string;
  href: string;
  date: string;
  overdue: boolean;
}

const ICONS = {
  follow_up: Bell,
  interview: CalendarClock,
  assessment: ClipboardList,
  email: Mail,
} as const;

export function Notifications({ items }: { items: NotificationItem[] }) {
  const overdue = items.filter((i) => i.overdue).length;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="relative"
                  aria-label="Notifications"
                />
              }
            />
          }
        >
          <Bell className="size-4" />
          {items.length > 0 ? (
            <span
              className={cn(
                "absolute top-1 right-1 size-1.5 rounded-full",
                overdue > 0 ? "bg-rose-500" : "bg-sky-500",
              )}
            />
          ) : null}
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-0">
        <PopoverHeader className="border-b px-3 py-2.5">
          <PopoverTitle>What needs attention</PopoverTitle>
          <PopoverDescription>
            {items.length === 0
              ? "You're all caught up."
              : `${items.length} item${items.length === 1 ? "" : "s"}${overdue ? `, ${overdue} overdue` : ""}`}
          </PopoverDescription>
        </PopoverHeader>
        {items.length > 0 ? (
          <ItemGroup className="max-h-80 scrollbar-thin gap-0 overflow-y-auto py-1">
            {items.map((n) => {
              const Icon = ICONS[n.kind];
              return (
                <Item
                  key={n.id}
                  size="sm"
                  render={<Link href={n.href} />}
                  className="rounded-none px-3 hover:bg-muted/60"
                >
                  <ItemMedia variant="icon" className={cn(n.overdue && "text-rose-500")}>
                    <Icon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="line-clamp-1">{n.title}</ItemTitle>
                    <ItemDescription className="line-clamp-1">
                      {n.subtitle}
                    </ItemDescription>
                  </ItemContent>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      n.overdue ? "text-rose-500" : "text-muted-foreground",
                    )}
                  >
                    {formatRelativeDay(n.date)}
                  </span>
                </Item>
              );
            })}
          </ItemGroup>
        ) : null}
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          {items.some((i) => i.kind === "email") ? (
            <Link
              href="/inbox"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Open Inbox
            </Link>
          ) : null}
          <Link
            href="/follow-ups"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            View all follow-ups →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
