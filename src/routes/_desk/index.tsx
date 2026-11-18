import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { StatusBadge } from "@/client/components/desk/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { formatDA, formatDate } from "@/lib/format";
import { wilayaName } from "@/lib/wilayas";
import { getOrders } from "@/serverFunctions/desk";

const search = z.object({
  view: z.enum(["due", "later", "all"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_desk/")({
  validateSearch: search,
  loaderDeps: ({ search }) => ({ view: search.view ?? "due" }),
  loader: ({ deps }) => getOrders({ data: deps }),
  component: Orders,
});

const VIEWS = [
  { value: "due", label: "To call" },
  { value: "later", label: "Call back later" },
  { value: "all", label: "All orders" },
] as const;

function Orders() {
  const orders = Route.useLoaderData();
  const view = Route.useSearch().view ?? "due";
  const { me } = Route.useRouteContext();
  const navigate = Route.useNavigate();

  if (!me.admin && me.role === "none") {
    return (
      <>
        <PageHeader title="Orders" />
        <div data-testid="no-role">
          <EmptyState
            title="You don't have a role yet"
            description="Ask an admin to make you a confirmer or a shipper."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Orders" />
      <Tabs
        value={view}
        onValueChange={(value) =>
          navigate({ search: { view: value as typeof view } })
        }
      >
        <TabsList>
          {VIEWS.map((v) => (
            <TabsTrigger
              key={v.value}
              value={v.value}
              data-testid={`filter-${v.value}`}
            >
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {orders.length === 0 ? (
        <EmptyState
          title={
            view === "due"
              ? "No orders to call"
              : view === "later"
                ? "No call-backs planned"
                : "No orders yet"
          }
          description={
            view === "all"
              ? "Orders placed in the store appear here."
              : undefined
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Placed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} data-testid={`order-row-${o.id}`}>
                  <TableCell>
                    <Link
                      to="/orders/$id"
                      params={{ id: String(o.id) }}
                      className="font-medium text-primary hover:underline"
                    >
                      {o.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{o.customerName}</div>
                    <div className="text-muted-foreground">
                      {o.phone} · {wilayaName(o.wilaya)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {o.product} · {o.variant} × {o.quantity}
                  </TableCell>
                  <TableCell>{formatDA(o.total)}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <StatusBadge status={o.status} />
                      {o.status === "pending" && o.lastOutcome ? (
                        <div className="text-muted-foreground">
                          {o.lastOutcome}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.assignee ?? "Nobody"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(o.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </>
  );
}
