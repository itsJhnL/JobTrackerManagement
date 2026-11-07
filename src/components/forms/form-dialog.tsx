"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Rendered inside a fresh mount on every open, so form defaults reset. */
  children: React.ReactNode;
  className?: string;
}

/**
 * Dialog shell for entity forms. The body is remounted each time the dialog
 * opens so React Hook Form defaults are recomputed without effects.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: FormDialogProps) {
  const [session, setSession] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setSession((n) => n + 1);
        onOpenChange(o);
      }}
    >
      <DialogContent
        className={cn(
          "max-h-[90svh] scrollbar-thin overflow-y-auto sm:max-w-lg",
          className,
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div key={session}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function FormDialogFooter({
  pending,
  submitLabel,
  onCancel,
}: {
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <DialogFooter className="mt-4">
      <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </DialogFooter>
  );
}
