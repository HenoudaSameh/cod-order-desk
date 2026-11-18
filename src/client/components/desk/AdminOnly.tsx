import { EmptyState } from "@/client/components/EmptyState";
import { Lock } from "lucide-react";

/** What a page shows someone whose role doesn't reach it. */
export function AdminOnly({
  title = "Only admins can open this page",
}: {
  title?: string;
}) {
  return (
    <div data-testid="admin-only">
      <EmptyState icon={Lock} title={title} />
    </div>
  );
}
