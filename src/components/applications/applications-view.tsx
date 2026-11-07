"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { ApplicationListItem } from "@/lib/data/applications";

import { ApplicationsTable } from "./table/applications-table";

interface ApplicationsViewProps {
  data: ApplicationListItem[];
  showingArchived: boolean;
  initialStatus?: string;
}

/** Owns URL-driven state (archived toggle, initial status) and renders the table. */
export function ApplicationsView({
  data,
  showingArchived,
  initialStatus,
}: ApplicationsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onToggleArchived = (v: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (v) params.set("archived", "1");
    else params.delete("archived");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`);
  };

  return (
    <ApplicationsTable
      key={showingArchived ? "archived" : "active"}
      data={data}
      showingArchived={showingArchived}
      onToggleArchived={onToggleArchived}
      initialStatus={initialStatus}
    />
  );
}
