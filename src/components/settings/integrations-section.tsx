"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CalendarSync, Mail, Plug, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";

import { disconnectGoogle } from "@/actions/integrations";
import {
  startGoogleSync,
  useGoogleSyncStatus,
} from "@/components/integrations/google-sync";
import { useFormat } from "@/components/timezone-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/shared/button-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { IntegrationSummary } from "@/lib/data/integrations";
import { cn } from "@/lib/utils";

interface IntegrationsSectionProps {
  summary: IntegrationSummary;
  oauthConfigured: boolean;
  encryptionConfigured: boolean;
  aiConfigured: boolean;
  redirectUri: string;
  /** From the OAuth callback redirect (?connected= / ?error=). */
  notice?: { connected?: string; error?: string };
}

const ERRORS: Record<string, string> = {
  denied: "You cancelled the Google consent screen. Nothing was connected.",
  invalid_state: "The sign-in link expired or did not match your session. Try again.",
  no_refresh_token:
    "Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.",
  exchange_failed:
    "Google rejected the authorization code. Check the OAuth client's redirect URI.",
  not_configured: "Google OAuth is not configured on the server.",
  google_error: "Google returned an error during sign-in.",
};

export function IntegrationsSection({
  summary,
  oauthConfigured,
  encryptionConfigured,
  aiConfigured,
  redirectUri,
  notice,
}: IntegrationsSectionProps) {
  const router = useRouter();
  const fmt = useFormat();
  const [pending, start] = useTransition();
  const syncing = useGoogleSyncStatus();
  const ready = oauthConfigured && encryptionConfigured;

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>,
    done: (d: unknown) => string,
  ) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Something went wrong");
      else {
        toast.success(done(r.data));
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-6">
      {notice?.connected ? (
        <Alert>
          <Plug />
          <AlertTitle>Google connected</AlertTitle>
          <AlertDescription>
            Run a Gmail or Calendar sync below. Nothing is sent or changed in your account
            without your approval.
          </AlertDescription>
        </Alert>
      ) : null}
      {notice?.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not connect Google</AlertTitle>
          <AlertDescription>{ERRORS[notice.error] ?? notice.error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Google account</CardTitle>
          <CardDescription>
            Official Google OAuth 2.0 with the minimum scopes: read-only Gmail (detect
            recruiting emails) and Calendar events (interviews). Tokens are encrypted at
            rest and never sent to the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!ready ? (
            <Alert>
              <AlertTitle>Not configured on the server</AlertTitle>
              <AlertDescription className="flex flex-col gap-1">
                {!oauthConfigured ? (
                  <span>
                    Set <code className="rounded bg-muted px-1">GOOGLE_CLIENT_ID</code>{" "}
                    and{" "}
                    <code className="rounded bg-muted px-1">GOOGLE_CLIENT_SECRET</code>{" "}
                    from a Google Cloud OAuth client (Web application) with redirect URI{" "}
                    <code className="rounded bg-muted px-1">{redirectUri}</code>, and
                    enable the Gmail API and Google Calendar API.
                  </span>
                ) : null}
                {!encryptionConfigured ? (
                  <span>
                    Set{" "}
                    <code className="rounded bg-muted px-1">
                      INTEGRATION_ENCRYPTION_KEY
                    </code>{" "}
                    (32 random bytes, base64) to encrypt stored tokens.
                  </span>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 rounded-full",
                  summary.connected && summary.status === "connected"
                    ? "bg-emerald-500"
                    : summary.status === "error"
                      ? "bg-amber-500"
                      : "bg-muted-foreground/40",
                )}
              />
              {summary.connected ? (
                <span>
                  {summary.accountEmail ?? "Google account"}
                  <span className="text-muted-foreground"> · {summary.status}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Not connected</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {summary.connected ? (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={<Button variant="outline" size="sm" disabled={pending} />}
                  >
                    <Unplug /> Disconnect
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Google?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Revokes access and deletes stored tokens, detected emails and
                        synced calendar events. Interviews you confirmed stay.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => run(disconnectGoogle, () => "Google disconnected")}
                      >
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
              {ready ? (
                <ButtonLink
                  href="/api/integrations/google/connect?features=gmail,calendar"
                  size="sm"
                  native
                >
                  <Plug /> {summary.connected ? "Reconnect" : "Connect Google"}
                </ButtonLink>
              ) : (
                <Button size="sm" disabled>
                  <Plug /> Connect Google
                </Button>
              )}
            </div>
          </div>
          {summary.lastError ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {summary.lastError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-4" /> Gmail
              <Badge
                variant={summary.gmail ? "secondary" : "outline"}
                className="ml-auto"
              >
                {summary.gmail ? "Access granted" : "Not granted"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Scans recent recruiting-looking mail (read-only), classifies it with AI, and
              queues interview invitations and responses for your review in Inbox.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="text-xs text-muted-foreground">
              Last sync:{" "}
              {summary.lastGmailSyncAt ? fmt.dateTime(summary.lastGmailSyncAt) : "never"}{" "}
              · {summary.pendingEmails} awaiting review
            </p>
            {!aiConfigured ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                AI is not configured; classification needs GEMINI_API_KEY.
              </p>
            ) : null}
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={syncing.gmail || !summary.gmail || !aiConfigured}
                onClick={() => startGoogleSync("gmail", () => router.refresh())}
              >
                <RefreshCw className={cn(syncing.gmail && "animate-spin")} />{" "}
                {syncing.gmail ? "Syncing Gmail…" : "Sync Gmail now"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarSync className="size-4" /> Google Calendar
              <Badge
                variant={summary.calendar ? "secondary" : "outline"}
                className="ml-auto"
              >
                {summary.calendar ? "Access granted" : "Not granted"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Mirrors upcoming events for the dashboard and keeps interviews you added to
              Calendar in sync (reschedules, cancellations). Events are only created when
              you approve.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="text-xs text-muted-foreground">
              Last sync:{" "}
              {summary.lastCalendarSyncAt
                ? fmt.dateTime(summary.lastCalendarSyncAt)
                : "never"}
            </p>
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={syncing.calendar || !summary.calendar}
                onClick={() => startGoogleSync("calendar", () => router.refresh())}
              >
                <RefreshCw className={cn(syncing.calendar && "animate-spin")} />{" "}
                {syncing.calendar ? "Syncing Calendar…" : "Sync Calendar now"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
