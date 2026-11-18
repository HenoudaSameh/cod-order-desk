import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Printer } from "lucide-react";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { formatDA } from "@/lib/format";
import { wilayaName } from "@/lib/wilayas";
import { getSlip } from "@/serverFunctions/desk";

export const Route = createFileRoute("/_desk/orders/$id/slip")({
  loader: ({ params }) => getSlip({ data: { id: Number(params.id) } }),
  component: Slip,
});

function Slip() {
  const { order, product, variant } = Route.useLoaderData();
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          backLink={
            <Link
              to="/orders/$id"
              params={{ id: String(order.id) }}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-4" aria-hidden />
              Order {order.id}
            </Link>
          }
          title="Delivery slip"
          actions={
            <Button onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          }
        />
      </div>
      <Card data-testid="slip" className="print:border-0 print:shadow-none">
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <div className="text-lg font-semibold">Order {order.id}</div>
            <div>
              {order.carrier ?? ""}
              {order.tracking ? ` · ${order.tracking}` : ""}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Deliver to</div>
            <div className="font-medium">{order.customerName}</div>
            <div>{order.phone}</div>
            <div>{order.address}</div>
            <div>
              {order.commune}, {wilayaName(order.wilaya)}
            </div>
            <div>
              {order.deliveryType === "home"
                ? "To the door"
                : "Collect at the courier office"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Items</div>
            <div>
              {product} · {variant} × {order.quantity}
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-muted-foreground">Amount to collect</div>
            <div className="text-2xl font-semibold" data-testid="slip-amount">
              {formatDA(order.unitPrice * order.quantity + order.deliveryFee)}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
