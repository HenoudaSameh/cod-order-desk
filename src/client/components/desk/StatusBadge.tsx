import { Badge } from "@/client/components/ui/badge";
import { STATUS_LABELS } from "@/lib/format";

const VARIANT: Record<
  string,
  "default" | "soft" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  confirmed: "soft",
  cancelled: "secondary",
  shipped: "soft",
  in_transit: "soft",
  out_for_delivery: "soft",
  delivered: "default",
  returned: "destructive",
};

export function StatusBadge({
  status,
  testId,
}: {
  status: string;
  testId?: string;
}) {
  return (
    <Badge variant={VARIANT[status] ?? "outline"} data-testid={testId}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
