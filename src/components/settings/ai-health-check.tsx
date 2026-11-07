"use client";

import { useState } from "react";
import { CheckCircle2, PlugZap, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type HealthResult =
  | { ok: true; model: string; usedFallback: boolean; latencyMs: number }
  | { ok: false; error: string; code?: string; retryable?: boolean };

/** "Test AI connection" button: calls /api/ai/health and shows a clear verdict. */
export function AiHealthCheck({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/health", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Partial<HealthResult> & {
        error?: string;
      };
      if (json.ok) setResult(json as HealthResult);
      else
        setResult({
          ok: false,
          error: json.error ?? `Health check failed (${res.status}).`,
          code: (json as { code?: string }).code,
        });
    } catch {
      setResult({ ok: false, error: "Could not reach the server.", retryable: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={run}
          disabled={loading || disabled}
        >
          {loading ? <Spinner /> : <PlugZap />}
          {loading ? "Testing…" : "Test AI connection"}
        </Button>
      </div>
      {result ? (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200"
              : "border-rose-500/30 bg-rose-500/5 text-rose-800 dark:text-rose-200",
          )}
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          )}
          {result.ok ? (
            <span>
              Connected. {result.model} answered in {(result.latencyMs / 1000).toFixed(1)}{" "}
              s{result.usedFallback ? " (primary model unavailable, fallback used)" : ""}.
            </span>
          ) : (
            <span>
              {result.error}
              {result.code ? <span className="opacity-70"> [{result.code}]</span> : null}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
