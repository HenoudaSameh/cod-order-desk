import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Printer, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/client/components/PageHeader";
import { Field } from "@/client/components/desk/Field";
import { Section } from "@/client/components/desk/Panel";
import { StatusBadge } from "@/client/components/desk/StatusBadge";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/client/components/ui/native-select";
import { useAction } from "@/client/lib/useAction";
import { formatDA, formatDate } from "@/lib/format";
import { WILAYAS, wilayaName } from "@/lib/wilayas";
import {
  cancelOrder,
  confirmOrder,
  editOrder,
  getOrder,
  reassignOrder,
  recordOutcome,
} from "@/serverFunctions/desk";

export const Route = createFileRoute("/_desk/orders/$id/")({
  loader: ({ params }) => getOrder({ data: { id: Number(params.id) } }),
  component: OrderPage,
});

type Data = Awaited<ReturnType<typeof getOrder>>;

function OrderPage() {
  const data = Route.useLoaderData();
  const { order, history } = data;
  const lowStock =
    (order.status === "pending" || order.status === "confirmed") &&
    data.stock < order.quantity;
  const total = order.unitPrice * order.quantity + order.deliveryFee;

  return (
    <>
      <PageHeader
        backLink={
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Orders
          </Link>
        }
        title={`Order ${order.id}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} testId="order-status" />
            Placed {formatDate(order.createdAt)}
            {data.assignee ? <> · {data.assignee}</> : null}
          </span>
        }
        actions={
          data.can.ship && !["pending", "cancelled"].includes(order.status) ? (
            <Button
              variant="outline"
              render={
                <Link to="/orders/$id/slip" params={{ id: String(order.id) }} />
              }
            >
              <Printer /> Delivery slip
            </Button>
          ) : null
        }
      />

      {lowStock ? (
        <Alert data-testid="stock-warning">
          <TriangleAlert />
          <AlertTitle>Not enough stock</AlertTitle>
          <AlertDescription>
            {data.stock} left of {data.variant}; this order needs{" "}
            {order.quantity}.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2" data-testid="order-customer">
          <CardHeader>
            <CardTitle>{order.customerName}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label="Phone">{order.phone}</Fact>
            <Fact label="Delivery">
              {order.deliveryType === "home" ? "To the door" : "Courier office"}
            </Fact>
            <Fact label="Address">
              <span data-testid="order-address">
                {order.address}, {order.commune}, {wilayaName(order.wilaya)}
              </span>
            </Fact>
            <Fact label="Item">
              {data.product} · {data.variant} × {order.quantity}
            </Fact>
            <Fact label="To collect">
              {formatDA(total)}{" "}
              <span className="text-muted-foreground">
                (delivery {formatDA(order.deliveryFee)})
              </span>
            </Fact>
            {order.carrier ? (
              <Fact label="Shipped with">
                {order.carrier}
                {order.tracking ? ` · ${order.tracking}` : ""}
              </Fact>
            ) : null}
            {order.campaignCode ? (
              <Fact label="Campaign">{order.campaignCode}</Fact>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              This phone's history
              {history.blocked ? (
                <Badge variant="destructive">Blocked</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2 text-center">
            <Stat
              label="Orders"
              value={history.orders}
              testId="history-orders"
            />
            <Stat
              label="Delivered"
              value={history.delivered}
              testId="history-delivered"
            />
            <Stat
              label="Returned"
              value={history.returned}
              testId="history-returned"
            />
          </CardContent>
        </Card>
      </div>

      {data.can.call || data.can.edit || data.can.reassign ? (
        <Actions data={data} />
      ) : null}

      <Section title="Timeline">
        <ol
          data-testid="timeline"
          className="space-y-3 border-l border-border pl-4 text-sm"
        >
          {data.events.map((e) => (
            <li key={e.id}>
              <div>{e.text}</div>
              <div className="text-muted-foreground">
                {formatDate(e.at)}
                {e.actorEmail ? ` · ${e.actorEmail}` : ""}
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <div>
      <div className="text-2xl font-semibold" data-testid={testId}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Actions({ data }: { data: Data }) {
  const { order } = data;
  const { run, busy } = useAction();
  const [outcome, setOutcome] = useState("no_answer");
  const [callbackOn, setCallbackOn] = useState("");
  const [assignTo, setAssignTo] = useState(data.confirmers[0]?.userId ?? "");
  const [cancelling, setCancelling] = useState(false);

  return (
    <Section title="Work on this order">
      <Card>
        <CardContent className="space-y-4">
          {data.can.call ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Call outcome" htmlFor="outcome">
                <NativeSelect
                  id="outcome"
                  data-testid="outcome-select"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                >
                  <NativeSelectOption value="no_answer">
                    No answer
                  </NativeSelectOption>
                  <NativeSelectOption value="callback">
                    Call back on…
                  </NativeSelectOption>
                  {data.callStatuses.map((s) => (
                    <NativeSelectOption key={s.id} value={`status:${s.id}`}>
                      {s.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              {outcome === "callback" ? (
                <Field label="Date" htmlFor="callback-date">
                  <Input
                    id="callback-date"
                    type="date"
                    data-testid="callback-date"
                    value={callbackOn}
                    onChange={(e) => setCallbackOn(e.target.value)}
                  />
                </Field>
              ) : null}
              <Button
                variant="outline"
                data-testid="outcome-save"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      recordOutcome({
                        data: {
                          id: order.id,
                          outcome,
                          ...(outcome === "callback" ? { callbackOn } : {}),
                        },
                      }),
                    "Call recorded",
                  )
                }
              >
                Record call
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {data.can.call ? (
              <Button
                data-testid="confirm-order"
                disabled={busy}
                onClick={() =>
                  run(
                    () => confirmOrder({ data: { id: order.id } }),
                    "Order confirmed",
                  )
                }
              >
                Confirm order
              </Button>
            ) : null}
            {data.can.edit ? <EditOrder data={data} /> : null}
            {data.can.edit ? (
              <Button
                variant="outline"
                data-testid="cancel-order"
                onClick={() => setCancelling(true)}
              >
                Cancel order
              </Button>
            ) : null}
          </div>
          {data.can.reassign && data.confirmers.length > 0 ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Assign to" htmlFor="reassign">
                <NativeSelect
                  id="reassign"
                  data-testid="reassign-select"
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                >
                  {data.confirmers.map((c) => (
                    <NativeSelectOption key={c.userId} value={c.userId}>
                      {c.email}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Button
                variant="outline"
                data-testid="reassign-save"
                disabled={busy || !assignTo}
                onClick={() =>
                  run(
                    () =>
                      reassignOrder({
                        data: { id: order.id, userId: assignTo },
                      }),
                    "Order reassigned",
                  )
                }
              >
                Reassign
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Dialog open={cancelling} onOpenChange={setCancelling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel order {order.id}?</DialogTitle>
            <DialogDescription>
              A cancelled order can't be confirmed or shipped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              data-testid="cancel-confirm"
              disabled={busy}
              onClick={async () => {
                if (
                  await run(
                    () => cancelOrder({ data: { id: order.id } }),
                    "Order cancelled",
                  )
                )
                  setCancelling(false);
              }}
            >
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function EditOrder({ data }: { data: Data }) {
  const { order } = data;
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customerName: order.customerName,
    phone: order.phone,
    wilaya: order.wilaya,
    commune: order.commune,
    address: order.address,
    deliveryType: order.deliveryType as "home" | "office",
    variantId: order.variantId,
    quantity: order.quantity,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const fee = data.fees[form.wilaya - 1];

  return (
    <>
      <Button
        variant="outline"
        data-testid="edit-order"
        onClick={() => setOpen(true)}
      >
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit order {order.id}</DialogTitle>
          </DialogHeader>
          <form
            id="edit-order-form"
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  () => editOrder({ data: { id: order.id, ...form } }),
                  "Order saved",
                )
              )
                setOpen(false);
            }}
          >
            <Field label="Full name" htmlFor="edit-name">
              <Input
                id="edit-name"
                value={form.customerName}
                onChange={(e) => set("customerName", e.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor="edit-phone">
              <Input
                id="edit-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Field label="Province" htmlFor="edit-wilaya">
              <NativeSelect
                id="edit-wilaya"
                value={form.wilaya}
                onChange={(e) => set("wilaya", Number(e.target.value))}
              >
                {WILAYAS.map((_, i) => (
                  <NativeSelectOption
                    key={i}
                    value={i + 1}
                    disabled={
                      data.fees[i]?.homeFee === null &&
                      data.fees[i]?.officeFee === null
                    }
                  >
                    {wilayaName(i + 1)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Commune" htmlFor="edit-commune">
              <Input
                id="edit-commune"
                value={form.commune}
                onChange={(e) => set("commune", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address" htmlFor="edit-address">
                <Input
                  id="edit-address"
                  data-testid="edit-address"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Delivery" htmlFor="edit-delivery">
              <NativeSelect
                id="edit-delivery"
                value={form.deliveryType}
                onChange={(e) =>
                  set("deliveryType", e.target.value as "home" | "office")
                }
              >
                <NativeSelectOption
                  value="home"
                  disabled={fee?.homeFee === null}
                >
                  To the door
                </NativeSelectOption>
                <NativeSelectOption
                  value="office"
                  disabled={fee?.officeFee === null}
                >
                  Courier office
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="Variant" htmlFor="edit-variant">
              <NativeSelect
                id="edit-variant"
                value={form.variantId}
                onChange={(e) => set("variantId", e.target.value)}
              >
                {data.variants.map((v) => (
                  <NativeSelectOption key={v.id} value={v.id}>
                    {v.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Quantity" htmlFor="edit-qty">
              <Input
                id="edit-qty"
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => set("quantity", Number(e.target.value))}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="submit"
              form="edit-order-form"
              data-testid="edit-save"
              disabled={busy}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
