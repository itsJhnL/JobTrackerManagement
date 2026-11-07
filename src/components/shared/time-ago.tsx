import { formatTimeAgo } from "@/lib/format";

/**
 * "5 seconds ago". The text depends on the current time, so the server render
 * and the browser's hydration pass can legitimately differ by a second or a
 * minute. suppressHydrationWarning tells React that difference is expected for
 * this one text node; the client value replaces it.
 */
export function TimeAgo({
  value,
  className,
}: {
  value: string | Date | null | undefined;
  className?: string;
}) {
  const iso = value ? new Date(value).toISOString() : undefined;
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {formatTimeAgo(value)}
    </time>
  );
}
