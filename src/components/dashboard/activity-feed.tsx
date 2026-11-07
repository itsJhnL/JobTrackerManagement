import Link from "next/link";
import {
  Activity,
  Archive,
  ArchiveRestore,
  BellRing,
  CalendarClock,
  Check,
  ClipboardList,
  FileUp,
  type LucideIcon,
  MessageSquare,
  Plus,
  RefreshCw,
  StickyNote,
  UserPlus,
  AlarmClock,
  Briefcase,
  CalendarSync,
  Mail,
  Plug,
  Unplug,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActivityType } from "@/lib/constants";
import type { ActivityWithApplication } from "@/lib/data/activities";
import { formatTimeAgo } from "@/lib/format";

const ICONS: Record<ActivityType, LucideIcon> = {
  application_created: Plus,
  status_changed: RefreshCw,
  interview_scheduled: CalendarClock,
  interview_updated: CalendarClock,
  assessment_added: ClipboardList,
  assessment_updated: ClipboardList,
  follow_up_created: BellRing,
  follow_up_completed: Check,
  follow_up_snoozed: AlarmClock,
  communication_logged: MessageSquare,
  contact_added: UserPlus,
  document_uploaded: FileUp,
  application_archived: Archive,
  application_restored: ArchiveRestore,
  note_added: StickyNote,
  employment_updated: Briefcase,
  email_detected: Mail,
  calendar_synced: CalendarSync,
  integration_connected: Plug,
  integration_disconnected: Unplug,
};

export function ActivityFeed({ activities }: { activities: ActivityWithApplication[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>What changed lately.</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Activity}
            title="No activity yet"
            description="Status changes, follow-ups and interviews will show up here."
          />
        ) : (
          <ol className="relative flex flex-col gap-0.5">
            {activities.map((a) => {
              const Icon = ICONS[a.activity_type] ?? Activity;
              return (
                <li key={a.id} className="flex items-start gap-3 rounded-md px-1 py-1.5">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="size-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {a.application ? (
                      <Link
                        href={`/applications/${a.application.id}`}
                        className="line-clamp-2 text-sm hover:underline"
                      >
                        {a.title}
                      </Link>
                    ) : (
                      <p className="line-clamp-2 text-sm">{a.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatTimeAgo(a.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
