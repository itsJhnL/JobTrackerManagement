"use client";

import { useCallback, useRef, useState } from "react";

import type { AiErrorCode } from "@/lib/ai/types";

export interface AiRequestError {
  message: string;
  code: AiErrorCode | "network";
  retryable: boolean;
}

interface State<T> {
  data: T | null;
  error: AiRequestError | null;
  loading: boolean;
}

/**
 * Small client helper for the AI route handlers. Tracks loading / error /
 * data, exposes retry (re-sends the last body) and reset.
 */
export function useAiRequest<T>(url: string) {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: false,
  });
  const lastBody = useRef<unknown>(null);
  const inflight = useRef<AbortController | null>(null);

  const send = useCallback(
    async (body: unknown): Promise<T | null> => {
      lastBody.current = body;
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => ({}))) as {
          data?: T;
          error?: string;
          code?: AiErrorCode;
          retryable?: boolean;
        };
        if (!res.ok || json.data === undefined) {
          setState({
            data: null,
            loading: false,
            error: {
              message: json.error ?? `Request failed (${res.status}).`,
              code: json.code ?? "provider_error",
              retryable: json.retryable ?? res.status >= 500,
            },
          });
          return null;
        }
        setState({ data: json.data, loading: false, error: null });
        return json.data;
      } catch (e) {
        if ((e as Error).name === "AbortError") return null;
        setState({
          data: null,
          loading: false,
          error: {
            message: "Could not reach the server. Check your connection.",
            code: "network",
            retryable: true,
          },
        });
        return null;
      }
    },
    [url],
  );

  const retry = useCallback(
    () => (lastBody.current !== null ? send(lastBody.current) : Promise.resolve(null)),
    [send],
  );
  const reset = useCallback(() => {
    inflight.current?.abort();
    setState({ data: null, error: null, loading: false });
  }, []);

  return { ...state, send, retry, reset };
}
