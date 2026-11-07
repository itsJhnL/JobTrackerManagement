"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { addDays, format } from "date-fns";
import { AlarmClock, Check, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  completeFollowUp,
  deleteFollowUp,
  reopenFollowUp,
  snoozeFollowUp,
} from "@/actions/follow-ups";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SNOOZE_PRESETS } from "@/lib/follow-ups";
import type { FollowUpStatus } from "@/lib/constants";

interface FollowUpActionsProps {
  id: string;
  status: FollowUpStatus;
  /** Compact icon-only buttons for dense lists. */
  compact?: boolean;
  onDone?: () => void;
}

export function FollowUpActions({ id, status, compact, onDone }: FollowUpActionsProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const open = status === "pending" || status === "snoozed";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Something went wrong");
      else {
        toast.success(success);
        onDone?.();
        router.refresh();
      }
    });
  }

  const markContacted = (scheduleNext: boolean) =>
    run(
      () => completeFollowUp({ id, scheduleNext }),
      scheduleNext
        ? "Marked as contacted and scheduled the next one"
        : "Marked as contacted",
    );

  const snooze = (days: number) => {
    const until = format(addDays(new Date(), days), "yyyy-MM-dd");
    run(
      () => snoozeFollowUp({ id, until }),
      `Snoozed until ${format(addDays(new Date(), days), "MMM d")}`,
    );
  };

  return (
    <div className="flex items-center gap-1">
      {open ? (
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size={compact ? "icon-xs" : "xs"}
                  disabled={pending}
                  onClick={() => markContacted(false)}
                  aria-label="Mark as contacted"
                />
              }
            >
              {pending ? <Spinner /> : <Check />}
              {!compact ? "Contacted" : null}
            </TooltipTrigger>
            <TooltipContent>Mark as contacted</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size={compact ? "icon-xs" : "xs"}
                        disabled={pending}
                        aria-label="Snooze"
                      />
                    }
                  />
                }
              >
                <AlarmClock />
                {!compact ? "Snooze" : null}
              </TooltipTrigger>
              <TooltipContent>Snooze</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
              {SNOOZE_PRESETS.map((p) => (
                <DropdownMenuItem key={p.days} onClick={() => snooze(p.days)}>
                  {p.label}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {format(addDays(new Date(), p.days), "EEE, MMM d")}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size={compact ? "icon-xs" : "icon-sm"}
              disabled={pending}
              aria-label="More actions"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {open ? (
            <DropdownMenuItem onClick={() => markContacted(true)}>
              <Check />
              Contacted, schedule next
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => run(() => reopenFollowUp(id), "Follow-up reopened")}
            >
              <RotateCcw />
              Reopen
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => run(() => deleteFollowUp(id), "Follow-up deleted")}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
