import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { useAction } from "@/client/lib/useAction";
import { formatDate } from "@/lib/format";
import { blockPhone, getCustomers, unblockPhone } from "@/serverFunctions/desk";

export const Route = createFileRoute("/_desk/customers")({
  loader: () => getCustomers(),
  component: Customers,
});

function Customers() {
  const customers = Route.useLoaderData();
  const { me } = Route.useRouteContext();
  const { run, busy } = useAction();
  return (
    <>
      <PageHeader title="Customers" />
      {customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Customers appear here after their first order."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Returned</TableHead>
                <TableHead>Last order</TableHead>
                {me.admin ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.phone} data-testid={`customer-${c.phone}`}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {c.name}
                      {c.blocked ? (
                        <Badge
                          variant="destructive"
                          data-testid={`blocked-${c.phone}`}
                        >
                          Blocked
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground">{c.phone}</div>
                  </TableCell>
                  <TableCell data-testid="customer-orders">
                    {c.orders}
                  </TableCell>
                  <TableCell data-testid="customer-delivered">
                    {c.delivered}
                  </TableCell>
                  <TableCell data-testid="customer-returned">
                    {c.returned}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(c.lastOrder)}
                  </TableCell>
                  {me.admin ? (
                    <TableCell className="text-right">
                      {c.blocked ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`unblock-${c.phone}`}
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => unblockPhone({ data: { phone: c.phone } }),
                              "Phone unblocked",
                            )
                          }
                        >
                          Unblock
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`block-${c.phone}`}
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => blockPhone({ data: { phone: c.phone } }),
                              "Phone blocked",
                            )
                          }
                        >
                          Block
                        </Button>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </>
  );
}
