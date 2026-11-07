"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { ParsedJob } from "@/lib/ai/types";

import { QuickAddSheet } from "./quick-add-sheet";

export interface QuickAddInitial {
  jobDescription?: string;
  /** Already-parsed job (from the AI page) so the sheet opens on the review step without re-parsing. */
  parsed?: ParsedJob;
}

interface QuickAddContextValue {
  open: (initial?: QuickAddInitial) => void;
  close: () => void;
  isOpen: boolean;
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used inside <QuickAddProvider>");
  return ctx;
}

export interface QuickAddDefaults {
  currency: string;
  timezone: string;
  hoursPerWeek: number;
}

export function QuickAddProvider({
  children,
  defaults,
}: {
  children: React.ReactNode;
  defaults: QuickAddDefaults;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [initial, setInitial] = useState<QuickAddInitial | undefined>();
  // Incremented on every open so the sheet remounts with fresh state.
  const [session, setSession] = useState(0);

  const open = useCallback((init?: QuickAddInitial) => {
    setInitial(init);
    setSession((n) => n + 1);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  // Global "N" shortcut (outside inputs) opens quick add.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (
        !typing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <QuickAddSheet
        key={session}
        open={isOpen}
        onOpenChange={setIsOpen}
        defaults={defaults}
        initial={initial}
      />
    </QuickAddContext.Provider>
  );
}
