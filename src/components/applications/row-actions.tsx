"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { archiveApplications, deleteApplications } from "@/actions/applications";
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RowActionsProps {
  id: string;
  companyName: string;
  jobUrl?: string | null;
  archived?: boolean;
  /** Where to go after a delete (detail page uses /applications). */
  afterDeleteHref?: string;
  size?: "icon-xs" | "icon-sm";
}

export function ApplicationRowActions({
  id,
  companyName,
  jobUrl,
  archived,
  afterDeleteHref,
  size = "icon-xs",
}: RowActionsProps) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  const archive = () =>
    start(async () => {
      const r = await archiveApplications({ ids: [id] }, !archived);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(archived ? "Application restored" : "Application archived");
        router.refresh();
      }
    });

  const remove = () =>
    start(async () => {
      const r = await deleteApplications({ ids: [id] });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Application deleted");
        setConfirmDelete(false);
        if (afterDeleteHref) router.push(afterDeleteHref);
        else router.refresh();
      }
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size={size}
              aria-label="More actions"
              onClick={(e) => e.stopPropagation()}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem render={<Link href={`/applications/${id}/edit`} />}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          {jobUrl ? (
            <DropdownMenuItem
              render={<a href={jobUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink />
              Open job post
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={archive} disabled={pending}>
            {archived ? <ArchiveRestore /> : <Archive />}
            {archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {companyName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the application and its follow-ups, interviews,
              assessments, communications and documents. Consider archiving instead if you
              might want it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
