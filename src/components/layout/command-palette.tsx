"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Building2, Moon, Plus, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ALL_NAV_ITEMS } from "@/lib/navigation";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/constants";

import { useQuickAdd } from "@/components/applications/quick-add-provider";

export interface SearchableApplication {
  id: string;
  company_name: string;
  job_title: string;
  status: ApplicationStatus;
}

interface CommandPaletteProps {
  applications: SearchableApplication[];
}

export function CommandPalette({ applications }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const quickAdd = useQuickAdd();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const run = useCallback((fn: () => void) => {
    setOpen(false);
    fn();
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-full justify-start gap-2 text-muted-foreground sm:w-56 md:w-64"
        onClick={() => setOpen(true)}
        aria-label="Open search"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left text-[0.8rem]">Search…</span>
        <KbdGroup className="hidden sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command palette"
        description="Search applications and jump anywhere."
      >
        {/* This CommandDialog is only the dialog shell; cmdk parts need the <Command> root for their store. */}
        <Command>
          <CommandInput placeholder="Search applications, pages, actions…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => run(() => quickAdd.open())}>
                <Plus />
                New application
                <CommandShortcut>N</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))
                }
              >
                {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                Toggle theme
              </CommandItem>
            </CommandGroup>

            {applications.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Applications">
                  {applications.slice(0, 50).map((a) => (
                    <CommandItem
                      key={a.id}
                      value={`${a.company_name} ${a.job_title}`}
                      onSelect={() => run(() => router.push(`/applications/${a.id}`))}
                    >
                      <Building2 />
                      <span className="truncate">
                        {a.company_name}
                        <span className="text-muted-foreground"> · {a.job_title}</span>
                      </span>
                      <CommandShortcut>
                        {APPLICATION_STATUS_LABELS[a.status]}
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}

            <CommandSeparator />
            <CommandGroup heading="Go to">
              {ALL_NAV_ITEMS.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`${item.title} ${item.hint ?? ""}`}
                  onSelect={() => run(() => router.push(item.href))}
                >
                  <item.icon />
                  {item.title}
                  {item.hint ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {item.hint}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
