import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { AdminOnly } from "@/client/components/desk/AdminOnly";
import { Field } from "@/client/components/desk/Field";
import { StatusBadge } from "@/client/components/desk/StatusBadge";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/client/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { useAction } from "@/client/lib/useAction";
import { formatDA, formatDate, STATUS_LABELS } from "@/lib/format";
import { wilayaName } from "@/lib/wilayas";
import {
  getShipping,
  setParcelStatus,
  shipOrders,
} from "@/serverFunctions/desk";

const STATUSES = [
  "all",
  "stale",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "returned",
] as const;
const search = z.object({
  tab: z.enum(["ready", "parcels"]).optional().catch(undefined),
  status: z.enum(STATUSES).optional().catch(undefined),
});

export const Route = createFileRoute("/_desk/shipping")({
  validateSearch: search,
  loaderDeps: ({ search }) => ({ status: search.status ?? "all" }),
  loader: ({ deps }) => getShipping({ data: deps }),
  component: Shipping,
});

type Board = Awaited<ReturnType<typeof getShipping>>;

function Shipping() {
  const board = Route.useLoaderData();
  const search = Route.useSearch();
  const tab = search.tab ?? "ready";
  const status = search.status ?? "all";
  const { me } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  if (!me.admin && me.role !== "shipper") {
    return (
      <>
        <PageHeader title="Shipping" />
        <AdminOnly title="Only shippers and admins can open this page" />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Shipping" />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({ search: (s) => ({ ...s, tab: value as typeof tab }) })
        }
      >
        <TabsList>
          <TabsTrigger value="ready" data-testid="tab-ready">
            Ready to ship ({board.ready.length})
          </TabsTrigger>
          <TabsTrigger value="parcels" data-testid="tab-parcels">
            Parcels
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "ready" ? (
        <Ready ready={board.ready} />
      ) : (
        <div className="space-y-4">
          <NativeSelect
            aria-label="Status"
            data-testid="parcel-status-filter"
            value={status}
            onChange={(e) =>
              navigate({
                search: (s) => ({
                  ...s,
                  status: e.target.value as typeof status,
                }),
              })
            }
          >
            {STATUSES.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {s === "all"
                  ? "All parcels"
                  : s === "stale"
                    ? "No news for 4 days"
                    : STATUS_LABELS[s]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Parcels parcels={board.parcels} />
        </div>
      )}
    </>
  );
}

function Ready({ ready }: { ready: Board["ready"] }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [open, setOpen] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState<Record<number, string>>({});
  const { run, busy } = useAction();
  const chosen = ready.filter((r) => selected.includes(r.id));

  if (ready.length === 0)
    return (
      <EmptyState
        title="Nothing to ship"
        description="Confirmed orders wait here."
      />
    );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          data-testid="ship-selected"
          disabled={chosen.length === 0}
          onClick={() => setOpen(true)}
        >
          Mark shipped{chosen.length ? ` (${chosen.length})` : ""}
        </Button>
      </div>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all"
                  checked={chosen.length === ready.length}
                  onCheckedChange={(on) =>
                    setSelected(on ? ready.map((r) => r.id) : [])
                  }
                />
              </TableHead>
              <TableHead>#</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>To collect</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ready.map((r) => (
              <TableRow key={r.id} data-testid={`ready-${r.id}`}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select order ${r.id}`}
                    data-testid={`select-${r.id}`}
                    checked={selected.includes(r.id)}
                    onCheckedChange={(on) =>
                      setSelected((s) =>
                        on ? [...s, r.id] : s.filter((x) => x !== r.id),
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <Link
                    to="/orders/$id"
                    params={{ id: String(r.id) }}
                    className="text-primary hover:underline"
                  >
                    {r.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{r.customerName}</div>
                  <div className="text-muted-foreground">
                    {r.commune}, {wilayaName(r.wilaya)}
                  </div>
                </TableCell>
                <TableCell>
                  {r.product} · {r.variant} × {r.quantity}
                </TableCell>
                <TableCell>{formatDA(r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Ship {chosen.length} {chosen.length === 1 ? "order" : "orders"}
            </DialogTitle>
          </DialogHeader>
          <form
            id="ship-form"
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                () =>
                  shipOrders({
                    data: {
                      carrier,
                      parcels: chosen.map((c) => ({
                        id: c.id,
                        tracking: tracking[c.id] ?? "",
                      })),
                    },
                  }),
                "Marked shipped",
              );
              if (ok) {
                setOpen(false);
                setSelected([]);
                setTracking({});
              }
            }}
          >
            <Field label="Courier or driver" htmlFor="ship-carrier">
              <Input
                id="ship-carrier"
                data-testid="ship-carrier"
                required
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
            </Field>
            {chosen.map((c) => (
              <Field
                key={c.id}
                label={`Tracking number, order ${c.id}`}
                htmlFor={`tracking-${c.id}`}
              >
                <Input
                  id={`tracking-${c.id}`}
                  data-testid={`ship-tracking-${c.id}`}
                  value={tracking[c.id] ?? ""}
                  onChange={(e) =>
                    setTracking((t) => ({ ...t, [c.id]: e.target.value }))
                  }
                />
              </Field>
            ))}
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="submit"
              form="ship-form"
              data-testid="ship-save"
              disabled={busy}
            >
              Mark shipped
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Parcels({ parcels }: { parcels: Board["parcels"] }) {
  if (parcels.length === 0)
    return <EmptyState kind="filtered" title="No parcels with this status" />;
  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Courier</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Since</TableHead>
            <TableHead>Move to</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parcels.map((p) => (
            <TableRow key={p.id} data-testid={`parcel-${p.id}`}>
              <TableCell>
                <Link
                  to="/orders/$id"
                  params={{ id: String(p.id) }}
                  className="text-primary hover:underline"
                >
                  {p.id}
                </Link>
              </TableCell>
              <TableCell>
                <div className="font-medium">{p.customerName}</div>
                <div className="text-muted-foreground">
                  {wilayaName(p.wilaya)}
                </div>
              </TableCell>
              <TableCell>
                <div>{p.carrier}</div>
                <div className="text-muted-foreground">{p.tracking}</div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <StatusBadge status={p.status} />
                  {p.stale ? (
                    <Badge variant="warning" data-testid={`stale-${p.id}`}>
                      No news for 4 days
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(p.statusChangedAt)}
              </TableCell>
              <TableCell>
                {p.next.length ? (
                  <MoveParcel key={p.status} id={p.id} next={p.next} />
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}

function MoveParcel({ id, next }: { id: number; next: string[] }) {
  const [status, setStatus] = useState(next[0]!);
  const { run, busy } = useAction();
  return (
    <div className="flex items-center gap-2">
      <NativeSelect
        size="sm"
        aria-label={`New status for order ${id}`}
        data-testid={`status-${id}`}
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        {next.map((s) => (
          <NativeSelectOption key={s} value={s}>
            {STATUS_LABELS[s]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button
        size="sm"
        variant="outline"
        data-testid={`status-save-${id}`}
        disabled={busy}
        onClick={() =>
          run(() =>
            setParcelStatus({ data: { id, status: status as "delivered" } }),
          )
        }
      >
        Save
      </Button>
    </div>
  );
}
