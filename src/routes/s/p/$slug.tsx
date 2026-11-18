import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { StoreShell } from "@/client/components/StoreShell";
import { Field } from "@/client/components/desk/Field";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/client/components/ui/native-select";
import { formatDA } from "@/lib/format";
import { wilayaName } from "@/lib/wilayas";
import { getStoreProduct } from "@/serverFunctions/storefront";

// Public (everyapp.config.ts): a product page and its order form.
export const Route = createFileRoute("/s/p/$slug")({
  validateSearch: z.object({
    c: z.string().max(40).optional().catch(undefined),
  }),
  loader: ({ params }) => getStoreProduct({ data: { slug: params.slug } }),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.product.name }] : [],
  }),
  component: ProductPage,
});

type Data = NonNullable<Awaited<ReturnType<typeof getStoreProduct>>>;

function ProductPage() {
  const data = Route.useLoaderData();
  if (!data) {
    return (
      <StoreShell storeName="Store">
        <EmptyState kind="filtered" title="This product isn't available" />
      </StoreShell>
    );
  }
  return (
    <StoreShell storeName={data.storeName}>
      <PageHeader
        title={data.product.name}
        description={
          <span className="text-lg font-semibold text-foreground">
            {formatDA(data.product.price)}
          </span>
        }
      />
      {data.product.description ? (
        <p className="whitespace-pre-line">{data.product.description}</p>
      ) : null}
      <OrderForm data={data} />
    </StoreShell>
  );
}

function OrderForm({ data }: { data: Data }) {
  const { c } = Route.useSearch();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    wilaya: "",
    commune: "",
    address: "",
    deliveryType: "home" as "home" | "office",
    variantId: data.variants[0]?.id ?? "",
    quantity: 1,
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const feeRow = form.wilaya ? data.fees[Number(form.wilaya) - 1] : undefined;
  const fee = feeRow
    ? form.deliveryType === "home"
      ? feeRow.homeFee
      : feeRow.officeFee
    : null;
  const subtotal = data.product.price * form.quantity;

  if (done) {
    return (
      <Card data-testid="order-thanks">
        <CardContent className="flex items-start gap-3">
          <CircleCheck
            className="mt-0.5 size-5 shrink-0 text-primary"
            aria-hidden
          />
          <div>
            <p className="font-semibold">Thank you, your order is in.</p>
            <p className="text-sm text-muted-foreground">
              We'll call {form.phone} to confirm it before shipping.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setSending(true);
            try {
              const res = await fetch("/s/api/order", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  ...form,
                  wilaya: Number(form.wilaya),
                  ...(c ? { campaign: c } : {}),
                }),
              });
              if (res.ok) setDone(true);
              else
                setError(
                  (
                    (await res.json().catch(() => null)) as {
                      error?: string;
                    } | null
                  )?.error ?? "Your order didn't go through. Try again.",
                );
            } catch {
              setError("Your order didn't go through. Try again.");
            } finally {
              setSending(false);
            }
          }}
        >
          <Field label="Full name" htmlFor="order-name">
            <Input
              id="order-name"
              data-testid="order-name"
              required
              autoComplete="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Phone" htmlFor="order-phone">
            <Input
              id="order-phone"
              data-testid="order-phone"
              required
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          {data.variants.length > 1 ? (
            <Field label="Option" htmlFor="order-variant">
              <NativeSelect
                id="order-variant"
                data-testid="order-variant"
                className="w-full"
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
          ) : (
            <input
              type="hidden"
              data-testid="order-variant"
              value={form.variantId}
            />
          )}
          <Field label="Quantity" htmlFor="order-qty">
            <Input
              id="order-qty"
              data-testid="order-qty"
              type="number"
              min={1}
              max={20}
              required
              value={form.quantity}
              onChange={(e) =>
                set("quantity", Math.max(1, Number(e.target.value) || 1))
              }
            />
          </Field>
          <Field label="Province" htmlFor="order-wilaya">
            <NativeSelect
              id="order-wilaya"
              data-testid="order-wilaya"
              className="w-full"
              required
              value={form.wilaya}
              onChange={(e) => set("wilaya", e.target.value)}
            >
              <NativeSelectOption value="" disabled>
                Choose…
              </NativeSelectOption>
              {data.fees.map((f) => (
                <NativeSelectOption
                  key={f.wilaya}
                  value={f.wilaya}
                  disabled={f.homeFee === null && f.officeFee === null}
                >
                  {wilayaName(f.wilaya)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Commune" htmlFor="order-commune">
            <Input
              id="order-commune"
              data-testid="order-commune"
              required
              value={form.commune}
              onChange={(e) => set("commune", e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address" htmlFor="order-address">
              <Input
                id="order-address"
                data-testid="order-address"
                required
                autoComplete="street-address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Delivery" htmlFor="order-delivery">
            <NativeSelect
              id="order-delivery"
              data-testid="order-delivery"
              className="w-full"
              value={form.deliveryType}
              onChange={(e) =>
                set("deliveryType", e.target.value as "home" | "office")
              }
            >
              <NativeSelectOption
                value="home"
                disabled={feeRow?.homeFee === null}
              >
                To my door
              </NativeSelectOption>
              <NativeSelectOption
                value="office"
                disabled={feeRow?.officeFee === null}
              >
                Pick up at the courier office
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <dl className="grid grid-cols-2 gap-y-1 text-sm sm:col-span-2">
            <dt className="text-muted-foreground">Product</dt>
            <dd className="text-right">{formatDA(subtotal)}</dd>
            <dt className="text-muted-foreground">Delivery</dt>
            <dd className="text-right" data-testid="order-fee">
              {fee === null || fee === undefined ? "—" : formatDA(fee)}
            </dd>
            <dt className="font-semibold">Total to pay on delivery</dt>
            <dd className="text-right font-semibold" data-testid="order-total">
              {formatDA(subtotal + (fee ?? 0))}
            </dd>
          </dl>
          {error ? (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            type="submit"
            size="lg"
            data-testid="order-submit"
            className="sm:col-span-2"
            disabled={sending || fee === null || fee === undefined}
          >
            Order now, pay on delivery
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
