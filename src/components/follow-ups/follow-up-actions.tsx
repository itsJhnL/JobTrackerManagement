"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDays, format } from "date-fns";
import {
  AlarmClock,
  Check,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  completeFollowUp,
  deleteFollowUp,
  reopenFollowUp,
  snoozeFollowUp,
} from "@/actions/follow-ups";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
  /** Adds "Edit" to the row menu, so a follow-up row needs only this one menu. */
  onEdit?: () => void;
}

export function FollowUpActions({
  id,
  status,
  compact,
  onDone,
  onEdit,
}: FollowUpActionsProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
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
              <DropdownMenuGroup>
                <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
                {SNOOZE_PRESETS.map((p) => (
                  <DropdownMenuItem key={p.days} onClick={() => snooze(p.days)}>
                    {p.label}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {format(addDays(new Date(), p.days), "EEE, MMM d")}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
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
          {onEdit ? (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil />
              Edit
            </DropdownMenuItem>
          ) : null}
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
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this follow-up?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirmDelete(false);
                run(() => deleteFollowUp(id), "Deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
