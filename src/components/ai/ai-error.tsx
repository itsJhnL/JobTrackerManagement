"use client";

import Link from "next/link";
import { KeyRound, RefreshCw, TriangleAlert } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import type { AiRequestError } from "./use-ai-request";

const TITLES: Record<string, string> = {
  not_configured: "AI is not configured",
  quota_exceeded: "AI quota exceeded",
  rate_limited: "Slow down a little",
  invalid_response: "Unexpected response",
  provider_error: "AI provider error",
  unauthorized: "Sign in required",
  bad_request: "Cannot run this yet",
  model_unavailable: "Model not available",
  network: "Connection problem",
};

export function AiErrorAlert({
  error,
  onRetry,
  loading,
}: {
  error: AiRequestError;
  onRetry?: () => void;
  loading?: boolean;
}) {
  const settingsHint = error.code === "bad_request" && /settings/i.test(error.message);
  return (
    <Alert variant="destructive">
      {error.code === "not_configured" ? <KeyRound /> : <TriangleAlert />}
      <AlertTitle>{TITLES[error.code] ?? "Something went wrong"}</AlertTitle>
      <AlertDescription>
        {error.message}
        {error.code === "not_configured"
          ? " Add GEMINI_API_KEY to .env.local (or your Vercel project) and restart. The key never reaches the browser."
          : null}
      </AlertDescription>
      {error.retryable && onRetry ? (
        <AlertAction>
          <Button size="xs" variant="outline" onClick={onRetry} disabled={loading}>
            <RefreshCw /> Retry
          </Button>
        </AlertAction>
      ) : settingsHint ? (
        <AlertAction>
          <Button size="xs" variant="outline" render={<Link href="/settings" />}>
            Open settings
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
