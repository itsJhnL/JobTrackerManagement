import { Badge } from "@/components/ui/badge";
import {
  APPLICATION_STATUS_COLORS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_STYLES,
  type ApplicationStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
  dot = true,
}: {
  status: ApplicationStatus;
  className?: string;
  dot?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(APPLICATION_STATUS_STYLES[status], "gap-1.5 font-medium", className)}
    >
      {dot ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: APPLICATION_STATUS_COLORS[status] }}
        />
      ) : null}
      {APPLICATION_STATUS_LABELS[status]}
    </Badge>
  );
}
