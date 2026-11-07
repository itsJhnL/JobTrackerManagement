"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CopyButton({
  text,
  label = "Copy",
  size = "sm",
  variant = "outline",
}: {
  text: string;
  label?: string;
  size?: "xs" | "sm" | "icon-sm";
  variant?: "outline" | "ghost" | "secondary";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy to the clipboard");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {size !== "icon-sm" ? (copied ? "Copied" : label) : null}
    </Button>
  );
}
