"use client";

import { useActionState } from "react";
import { Download, KeyRound, LogOut, Sparkles } from "lucide-react";

import { ButtonLink } from "@/components/shared/button-link";
import { signOut, updatePassword, type AuthState } from "@/actions/auth";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { AiHealthCheck } from "./ai-health-check";

interface AccountSectionProps {
  email: string | null;
  ai: {
    provider: string;
    configured: boolean;
    model: string | null;
    fallbackModel: string | null;
  };
}

export function AccountSection({ email, ai }: AccountSectionProps) {
  const [state, action] = useActionState<AuthState, FormData>(updatePassword, null);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>AI provider</CardTitle>
          <CardDescription>
            Configured through environment variables on the server. Keys are never sent to
            the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" />
              {ai.provider}
              {ai.model ? (
                <span className="text-xs text-muted-foreground">
                  · {ai.model}
                  {ai.fallbackModel ? ` (fallback ${ai.fallbackModel})` : ""}
                </span>
              ) : null}
            </span>
            <Badge
              variant={ai.configured ? "secondary" : "outline"}
              className={
                ai.configured
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-muted-foreground"
              }
            >
              {ai.configured ? "Configured" : "Not configured"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Set <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> (and
            optionally <code className="rounded bg-muted px-1">GEMINI_MODEL</code>) in{" "}
            <code className="rounded bg-muted px-1">.env.local</code> or your hosting
            provider. Restart the server after changing it.
          </p>
          <AiHealthCheck disabled={!ai.configured} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export data</CardTitle>
          <CardDescription>
            Download your applications as CSV. Each row keeps its own currency.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <ButtonLink href="/api/export/csv" variant="outline" native>
            <Download /> Active applications
          </ButtonLink>
          <ButtonLink href="/api/export/csv?archived=1" variant="outline" native>
            <Download /> Including archived
          </ButtonLink>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Signed in as {email ?? "unknown"}.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <Input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
                <Input
                  id="confirm-password"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </Field>
            </FieldGroup>
            {state?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
            {state?.message ? (
              <Alert>
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            ) : null}
            <div>
              <SubmitButton variant="outline" pendingText="Updating…">
                <KeyRound /> Update password
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Sign out of this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signOut}>
            <SubmitButton variant="outline" pendingText="Signing out…">
              <LogOut /> Sign out
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
