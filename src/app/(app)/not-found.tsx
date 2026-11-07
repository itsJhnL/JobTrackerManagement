import Link from "next/link";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Not found"
      description="That page or record does not exist, or it belongs to a different account."
      action={
        <Button variant="outline" render={<Link href="/dashboard" />}>
          Back to dashboard
        </Button>
      }
    />
  );
}
