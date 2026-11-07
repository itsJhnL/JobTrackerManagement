"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { useQuickAdd } from "./quick-add-provider";

export function QuickAddButton({ className }: { className?: string }) {
  const { open } = useQuickAdd();
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button size="sm" className={className} onClick={() => open()} />}
      >
        <Plus data-icon="inline-start" />
        <span className="hidden sm:inline">Add application</span>
        <span className="sm:hidden">Add</span>
      </TooltipTrigger>
      <TooltipContent>
        Quick add <Kbd>N</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
