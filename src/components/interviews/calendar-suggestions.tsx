"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarSearch, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { trackCalendarEvent } from "@/actions/integrations";
import { useFormat } from "@/components/timezone-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { INTERVIEW_TYPE_LABELS } from "@/lib/constants";
import type { InterviewSuggestion } from "@/lib/data/integrations";

import type { ApplicationOption } from "./interview-form";

const NEW = "__new__";

/**
 * Calendar events that look like interviews but matched no application. One
 * click links them to an application (or creates it), so nothing is retyped.
 */
export function CalendarSuggestions({
  suggestions,
  applications,
}: {
  suggestions: InterviewSuggestion[];
  applications: ApplicationOption[];
}) {
  const fmt = useFormat();
  const [active, setActive] = useState<InterviewSuggestion | null>(null);
  if (suggestions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarSearch className="size-4" /> Possible interviews on your calendar
        </CardTitle>
        <CardDescription>
          These events look like interviews but don&apos;t clearly match an application.
          Track one to add it with its time and meeting link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y rounded-lg border">
          {suggestions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.summary ?? "(no title)"}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {fmt.dateTime(s.starts_at)}
                  {s.platform ? ` · ${s.platform}` : ""}
                  {s.html_link ? (
                    <>
                      {" · "}
                      <a
                        href={s.html_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                      >
                        Open in Calendar <ExternalLink className="size-3" />
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setActive(s)}>
                Track interview
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      {active ? (
        <TrackDialog
          key={active.id}
          suggestion={active}
          applications={applications}
          onClose={() => setActive(null)}
        />
      ) : null}
    </Card>
  );
}

function TrackDialog({
  suggestion,
  applications,
  onClose,
}: {
  suggestion: InterviewSuggestion;
  applications: ApplicationOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<string>(
    suggestion.suggestedApplicationId ?? (applications.length ? "" : NEW),
  );
  const [company, setCompany] = useState(suggestion.companyGuess ?? "");
  const [title, setTitle] = useState("");
  const isNew = choice === NEW;

  const items = [
    ...applications.map((a) => ({
      value: a.id,
      label: `${a.company_name} · ${a.job_title}`,
    })),
    { value: NEW, label: "New application…" },
  ];

  const submit = () =>
    start(async () => {
      const r = await trackCalendarEvent({
        calendar_event_id: suggestion.id,
        interview_type: suggestion.interviewType,
        ...(isNew
          ? { new_application: { company_name: company, job_title: title } }
          : { application_id: choice || undefined }),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Interview tracked from your calendar");
      onClose();
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Track interview</DialogTitle>
          <DialogDescription>
            {suggestion.summary ?? "Calendar event"} ·{" "}
            {INTERVIEW_TYPE_LABELS[suggestion.interviewType]}. The time and meeting link
            come from your calendar and stay in sync.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="track-application">Application</Label>
            <Select
              items={items}
              value={choice || null}
              onValueChange={(value) => setChoice(value ?? "")}
            >
              <SelectTrigger id="track-application" className="w-full">
                <SelectValue placeholder="Choose an application" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isNew ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="track-company">Company</Label>
                <Input
                  id="track-company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="track-title">Job title</Label>
                <Input
                  id="track-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || (isNew ? !company.trim() || !title.trim() : !choice)}
          >
            {pending ? <Spinner /> : null}
            {pending ? "Saving…" : "Track interview"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
