"use client";

import {
  Check,
  LayoutGrid,
  List,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export interface FacetOption {
  value: string;
  label: string;
  count?: number;
  color?: string;
}

interface FacetedFilterProps {
  title: string;
  options: FacetOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}

export function FacetedFilter({
  title,
  options,
  selected,
  onChange,
}: FacetedFilterProps) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="h-8 border-dashed" />}
      >
        <SlidersHorizontal className="size-3.5" />
        {title}
        {selected.length > 0 ? (
          <>
            <Separator
              orientation="vertical"
              className="mx-1 data-[orientation=vertical]:h-4"
            />
            <span className="hidden gap-1 lg:flex">
              {selected.length > 2 ? (
                <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                  {selected.length} selected
                </Badge>
              ) : (
                options
                  .filter((o) => selected.includes(o.value))
                  .map((o) => (
                    <Badge
                      key={o.value}
                      variant="secondary"
                      className="rounded-sm px-1 font-normal"
                    >
                      {o.label}
                    </Badge>
                  ))
              )}
            </span>
            <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
              {selected.length}
            </Badge>
          </>
        ) : null}
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const active = selected.includes(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => toggle(o.value)}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border border-input",
                        active && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {active ? <Check className="size-3" /> : null}
                    </span>
                    {o.color ? (
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: o.color }}
                      />
                    ) : null}
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.count !== undefined ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {o.count}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => onChange([])}
                    className="justify-center text-muted-foreground"
                  >
                    Clear filter
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface RangeFilterProps {
  title: string;
  value: [number | undefined, number | undefined];
  bounds?: [number, number];
  onChange: (value: [number | undefined, number | undefined]) => void;
}

export function RangeFilter({ title, value, bounds, onChange }: RangeFilterProps) {
  const active = value[0] !== undefined || value[1] !== undefined;
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="h-8 border-dashed" />}
      >
        <SlidersHorizontal className="size-3.5" />
        {title}
        {active ? (
          <>
            <Separator
              orientation="vertical"
              className="mx-1 data-[orientation=vertical]:h-4"
            />
            <Badge
              variant="secondary"
              className="rounded-sm px-1 font-normal tabular-nums"
            >
              {value[0] ?? "…"} – {value[1] ?? "…"}
            </Badge>
          </>
        ) : null}
      </PopoverTrigger>
      <PopoverContent className="w-60" align="start">
        <p className="text-xs text-muted-foreground">
          Effective rate, in each application&apos;s own currency.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            placeholder={bounds ? String(bounds[0]) : "Min"}
            value={value[0] ?? ""}
            onChange={(e) =>
              onChange([
                e.target.value === "" ? undefined : Number(e.target.value),
                value[1],
              ])
            }
            aria-label="Minimum rate"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            inputMode="decimal"
            placeholder={bounds ? String(bounds[1]) : "Max"}
            value={value[1] ?? ""}
            onChange={(e) =>
              onChange([
                value[0],
                e.target.value === "" ? undefined : Number(e.target.value),
              ])
            }
            aria-label="Maximum rate"
          />
        </div>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange([undefined, undefined])}
          >
            Clear
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search company or title…",
}: SearchInputProps) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8"
        aria-label="Search applications"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export interface ColumnToggle {
  id: string;
  label: string;
  visible: boolean;
}

export function ColumnVisibilityMenu({
  columns,
  onToggle,
}: {
  columns: ColumnToggle[];
  onToggle: (id: string, visible: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="h-8" />}
      >
        <Settings2 className="size-3.5" />
        <span className="hidden sm:inline">Columns</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {columns.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={c.visible}
              onCheckedChange={(v) => onToggle(c.id, !!v)}
              closeOnClick={false}
            >
              {c.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ViewToggle({
  view,
  onChange,
}: {
  view: "table" | "cards";
  onChange: (v: "table" | "cards") => void;
}) {
  return (
    <ToggleGroup
      value={[view]}
      onValueChange={(v) => {
        const next = v[0];
        if (next === "table" || next === "cards") onChange(next);
      }}
      variant="outline"
      size="sm"
      aria-label="View"
    >
      <ToggleGroupItem value="table" aria-label="Table view">
        <List />
      </ToggleGroupItem>
      <ToggleGroupItem value="cards" aria-label="Card view">
        <LayoutGrid />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function ArchivedToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-2.5 text-sm select-none">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(!!v)}
        className="size-3.5"
      />
      Archived
    </label>
  );
}
