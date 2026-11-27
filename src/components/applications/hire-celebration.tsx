"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HireEvent } from "@/lib/hire-event";

/**
 * Celebration shown when an application is marked Hired.
 *
 * It is driven by an event, not by state on a page: a server action returns a
 * HireEvent only after the status change was saved, and the caller passes it
 * to celebrateHire(). Each event id is shown once, so re-renders, refreshes,
 * failed saves and retries can never show it twice (or at all, for failures).
 */
let current: HireEvent | null = null;
const seen = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Call with the event a server action returned. Ignores null and repeats. */
export function celebrateHire(event: HireEvent | null | undefined) {
  if (!event || seen.has(event.id)) return;
  seen.add(event.id);
  current = event;
  emit();
}

function close() {
  current = null;
  emit();
}

const COLORS = ["#6250d6", "#1baf7a", "#eda100", "#2a78d6", "#e87ba4", "#eb6834"];
const DURATION_MS = 2600;

/** A single short burst from the top of the screen. No dependency, no loop. */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const count = Math.min(140, Math.round(width / 9));
    const pieces = Array.from({ length: count }, (_, i) => ({
      x: width / 2 + (Math.random() - 0.5) * width * 0.5,
      y: height * 0.28 + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 11,
      vy: -(4 + Math.random() * 9),
      size: 5 + Math.random() * 5,
      spin: Math.random() * Math.PI,
      spinSpeed: (Math.random() - 0.5) * 0.3,
      color: COLORS[i % COLORS.length],
    }));

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - started;
      ctx.clearRect(0, 0, width, height);
      // Fade out over the last 600 ms so it ends softly.
      ctx.globalAlpha = Math.max(0, Math.min(1, (DURATION_MS - elapsed) / 600));
      for (const p of pieces) {
        p.vy += 0.22;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.spin += p.spinSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (elapsed < DURATION_MS) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      data-slot="confetti"
      className="pointer-events-none fixed inset-0 z-[60] size-full"
    />
  );
}

/** Mounted once in the app shell. */
export function HireCelebration({ firstName }: { firstName: string | null }) {
  const router = useRouter();
  const event = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );

  return (
    <>
      {event ? <Confetti key={event.id} /> : null}
      <Dialog open={!!event} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="items-center text-center">
            <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <PartyPopper className="size-6" />
            </div>
            <DialogTitle className="text-xl">
              Congratulations{firstName ? `, ${firstName}` : ""}! You&apos;re hired!
            </DialogTitle>
            <DialogDescription className="text-center">
              {event ? (
                <>
                  <span className="font-medium text-foreground">{event.jobTitle}</span> at{" "}
                  <span className="font-medium text-foreground">{event.company}</span> is
                  now marked as Hired. It has been added to your Inbox and counts toward
                  your income.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              variant="outline"
              onClick={() => {
                close();
                router.push("/dashboard");
              }}
            >
              Go to dashboard
            </Button>
            <Button onClick={close} autoFocus>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
