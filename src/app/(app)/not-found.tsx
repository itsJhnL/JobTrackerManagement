import { SearchX } from "lucide-react";

import { ButtonLink } from "@/components/shared/button-link";
import { EmptyState } from "@/components/shared/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Not found"
      description="That page or record does not exist, or it belongs to a different account."
      action={
        <ButtonLink href="/dashboard" variant="outline">
          Back to dashboard
        </ButtonLink>
      }
    />
  );
}
