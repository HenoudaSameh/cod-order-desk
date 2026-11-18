import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { AdminOnly } from "@/client/components/desk/AdminOnly";
import { Section } from "@/client/components/desk/Panel";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { formatDA } from "@/lib/format";
import { getProfit } from "@/serverFunctions/desk";

const currentMonth = () => new Date().toISOString().slice(0, 7);
const search = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/_desk/profit")({
  validateSearch: search,
  loaderDeps: ({ search }) => ({ month: search.month ?? currentMonth() }),
  loader: ({ context, deps }) =>
    context.me.admin ? getProfit({ data: deps }) : null,
  component: Profit,
});

function Profit() {
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();
  if (!data) {
    return (
      <>
        <PageHeader title="Profit" />
        <AdminOnly />
      </>
    );
  }
  const rows = [
    {
      label: "Collected from delivered orders",
      value: data.collected,
      testId: "profit-collected",
    },
    {
      label: "Product cost",
      value: -data.productCost,
      testId: "profit-product-cost",
      shown: data.productCost,
    },
    {
      label: "Delivery fees",
      value: -data.delivery,
      testId: "profit-delivery",
      shown: data.delivery,
    },
    {
      label: `Returns (${data.returnedOrders})`,
      value: -data.returns,
      testId: "profit-returns",
      shown: data.returns,
    },
    {
      label: "Ad spend",
      value: -data.ads,
      testId: "profit-ads",
      shown: data.ads,
    },
  ];
  return (
    <>
      <PageHeader
        title="Profit"
        actions={
          <Input
            type="month"
            aria-label="Month"
            data-testid="month"
            className="w-44"
            value={data.month}
            onChange={(e) =>
              e.target.value && navigate({ search: { month: e.target.value } })
            }
          />
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">Net profit</div>
            <div className="text-3xl font-semibold" data-testid="profit-net">
              {formatDA(data.net)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Delivered orders
            </div>
            <div className="text-3xl font-semibold">{data.deliveredOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Ad cost per delivered order
            </div>
            <div className="text-3xl font-semibold">
              {data.deliveredOrders
                ? formatDA(data.ads / data.deliveredOrders)
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>
      <Section title="Breakdown">
        <TableCard>
          <Table>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.testId}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right">
                    {r.value < 0 ? "− " : ""}
                    <span data-testid={r.testId}>
                      {formatDA(r.shown ?? r.value)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Net profit</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatDA(data.net)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableCard>
      </Section>
      <Section title="By product">
        {data.products.length === 0 ? (
          <EmptyState title="No deliveries or returns this month" />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Units delivered</TableHead>
                  <TableHead>Returns</TableHead>
                  <TableHead>Collected</TableHead>
                  <TableHead>Cost and delivery</TableHead>
                  <TableHead>Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((p) => (
                  <TableRow key={p.name} data-testid="profit-product">
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.delivered}</TableCell>
                    <TableCell>{p.returned}</TableCell>
                    <TableCell>{formatDA(p.revenue)}</TableCell>
                    <TableCell>{formatDA(p.cost)}</TableCell>
                    <TableCell>{formatDA(p.margin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </Section>
    </>
  );
}
