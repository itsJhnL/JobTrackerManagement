"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CalendarPlus, CalendarSync } from "lucide-react";
import { toast } from "sonner";

import { addInterviewToCalendar } from "@/actions/integrations";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** "Add to Google Calendar" entry for interview menus. Explicit user action; never automatic. */
export function AddToCalendarMenuItem({
  interviewId,
  synced,
}: {
  interviewId: string;
  synced: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <DropdownMenuItem
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await addInterviewToCalendar(interviewId);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(
              synced ? "Google Calendar event updated" : "Added to Google Calendar",
            );
            router.refresh();
          }
        })
      }
    >
      {synced ? <CalendarSync /> : <CalendarPlus />}
      {synced ? "Update Google Calendar" : "Add to Google Calendar"}
    </DropdownMenuItem>
  );
}
