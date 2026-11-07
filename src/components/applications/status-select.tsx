"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { updateApplicationStatus } from "@/actions/applications";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_COLORS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_STYLES,
  type ApplicationStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

interface StatusSelectProps {
  id: string;
  status: ApplicationStatus;
  size?: "sm" | "default";
  className?: string;
}

/** Inline status changer. Optimistic: the badge updates immediately and reverts on failure. */
export function StatusSelect({ id, status, size = "sm", className }: StatusSelectProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(status);

  return (
    <Select
      items={APPLICATION_STATUSES.map((s) => ({
        value: s,
        label: APPLICATION_STATUS_LABELS[s],
      }))}
      value={optimistic}
      onValueChange={(value) => {
        if (!value || value === optimistic) return;
        const next = value as ApplicationStatus;
        start(async () => {
          setOptimistic(next);
          const r = await updateApplicationStatus({ id, status: next });
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(`Moved to ${APPLICATION_STATUS_LABELS[next]}`);
            router.refresh();
          }
        });
      }}
      disabled={pending}
    >
      <SelectTrigger
        size={size}
        aria-label="Change status"
        className={cn(
          "h-6 gap-1 rounded-4xl border-transparent px-2 text-xs font-medium [&_svg]:size-3",
          APPLICATION_STATUS_STYLES[optimistic],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: APPLICATION_STATUS_COLORS[optimistic] }}
        />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {APPLICATION_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: APPLICATION_STATUS_COLORS[s] }}
            />
            {APPLICATION_STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
