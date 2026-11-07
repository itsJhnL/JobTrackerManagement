import { BriefcaseBusiness } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <BriefcaseBusiness className="size-4" />
        </span>
        <span className="font-heading text-lg font-semibold tracking-tight">
          Job Tracker
        </span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
        Your data stays in your own Supabase project. Nothing is sent on your behalf.
      </p>
    </div>
  );
}
