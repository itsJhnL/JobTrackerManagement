import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function KeyValueList({
  items,
  columns = 2,
}: {
  items: { label: string; value: React.ReactNode }[];
  columns?: 1 | 2 | 3;
}) {
  const visible = items.filter(
    (i) => i.value !== null && i.value !== undefined && i.value !== "" && i.value !== "—",
  );
  if (visible.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3 text-sm",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
      )}
    >
      {visible.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className="mt-0.5 break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Prose({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text)
    return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <div className={cn("text-sm leading-relaxed whitespace-pre-wrap", className)}>
      {text}
    </div>
  );
}
