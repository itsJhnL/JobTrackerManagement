"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message = error instanceof Error ? error.message : "Something went wrong.";
  const isEnv = /NEXT_PUBLIC_SUPABASE|supabaseUrl|supabaseKey/i.test(message);

  return (
    <EmptyState
      icon={TriangleAlert}
      title={isEnv ? "Supabase is not configured" : "Something went wrong"}
      description={
        isEnv
          ? "Copy .env.example to .env.local, add your Supabase URL and anon key, then restart the dev server."
          : message
      }
      action={
        <Button onClick={() => retry()} variant="outline">
          Try again
        </Button>
      }
    />
  );
}
