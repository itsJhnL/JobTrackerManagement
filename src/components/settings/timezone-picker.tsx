"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, LocateFixed } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  describeTimezone,
  detectTimezone,
  isValidTimezone,
  listTimezones,
} from "@/lib/timezone";
import { cn } from "@/lib/utils";

interface TimezonePickerProps {
  value: string;
  onChange: (id: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Show a "Use my device's time zone" shortcut. */
  allowDetect?: boolean;
}

/**
 * Searchable IANA time-zone picker: city/region, UTC offset (DST-aware at
 * render time) and the long zone name. Common zones first, Manila on top.
 */
export function TimezonePicker({
  value,
  onChange,
  id,
  disabled,
  className,
  allowDetect = true,
}: TimezonePickerProps) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(() => listTimezones(), []);
  const common = zones.filter((z) => z.common);
  const others = zones.filter((z) => !z.common);
  const selected = isValidTimezone(value) ? describeTimezone(value) : null;
  const detected = useMemo(() => detectTimezone(), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn("h-8 w-full justify-between font-normal", className)}
          />
        }
      >
        <span className="truncate">
          {selected ? (
            <>
              {selected.city}
              <span className="text-muted-foreground"> · UTC{selected.offset}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Choose a time zone</span>
          )}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-[--anchor-width] min-w-80 p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const q = search.trim().toLowerCase();
            if (!q) return 1;
            return itemValue.toLowerCase().includes(q) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search city, region or offset…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No time zone found.</CommandEmpty>
            {allowDetect && detected !== value ? (
              <>
                <CommandGroup>
                  <CommandItem
                    value={`detect ${detected} ${describeTimezone(detected).city}`}
                    onSelect={() => {
                      onChange(detected);
                      setOpen(false);
                    }}
                  >
                    <LocateFixed />
                    Use my device&apos;s time zone
                    <span className="ml-auto text-xs text-muted-foreground">
                      {describeTimezone(detected).city}
                    </span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            <CommandGroup heading="Common">
              {common.map((z) => (
                <ZoneItem
                  key={z.id}
                  zone={z}
                  selected={value === z.id}
                  onSelect={() => {
                    onChange(z.id);
                    setOpen(false);
                  }}
                />
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="All time zones">
              {others.map((z) => (
                <ZoneItem
                  key={z.id}
                  zone={z}
                  selected={value === z.id}
                  onSelect={() => {
                    onChange(z.id);
                    setOpen(false);
                  }}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ZoneItem({
  zone: z,
  selected,
  onSelect,
}: {
  zone: ReturnType<typeof describeTimezone>;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value={`${z.id} ${z.city} ${z.region} UTC${z.offset} ${z.longName ?? ""} ${z.shortName ?? ""}`}
      onSelect={onSelect}
    >
      <Check className={cn("size-3.5", selected ? "opacity-100" : "opacity-0")} />
      <span className="flex-1 truncate">
        {z.city}
        {z.region ? <span className="text-muted-foreground"> · {z.region}</span> : null}
        {z.longName ? (
          <span className="block truncate text-xs text-muted-foreground">
            {z.longName}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        UTC{z.offset}
      </span>
    </CommandItem>
  );
}
