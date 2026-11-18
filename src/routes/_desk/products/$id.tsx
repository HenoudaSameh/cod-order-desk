import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/client/components/PageHeader";
import { AdminOnly } from "@/client/components/desk/AdminOnly";
import { Field } from "@/client/components/desk/Field";
import { Section } from "@/client/components/desk/Panel";
import { ProductForm } from "@/client/components/desk/ProductForm";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
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
import { useAction } from "@/client/lib/useAction";
import { formatDate } from "@/lib/format";
import {
  addVariant,
  adjustStock,
  archiveProduct,
  getProduct,
  updateProduct,
} from "@/serverFunctions/desk";

export const Route = createFileRoute("/_desk/products/$id")({
  loader: ({ context, params }) =>
    context.me.admin ? getProduct({ data: { id: params.id } }) : null,
  component: ProductPage,
});

function ProductPage() {
  const data = Route.useLoaderData();
  const { run, busy } = useAction();
  if (!data) {
    return (
      <>
        <PageHeader title="Product" />
        <AdminOnly />
      </>
    );
  }
  const { product } = data;
  return (
    <>
      <PageHeader
        backLink={
          <Link
            to="/products"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Products
          </Link>
        }
        title={
          <span className="inline-flex items-center gap-2">
            {product.name}
            {product.archived ? (
              <Badge variant="secondary">Archived</Badge>
            ) : null}
          </span>
        }
        actions={
          <>
            {product.published && !product.archived ? (
              <Button
                variant="outline"
                data-testid="store-link"
                render={
                  <a
                    href={`/s/p/${product.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <ExternalLink /> Store page
              </Button>
            ) : null}
            <Button
              variant="outline"
              data-testid="archive-product"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    archiveProduct({
                      data: { id: product.id, archived: !product.archived },
                    }),
                  product.archived ? "Product restored" : "Product archived",
                )
              }
            >
              {product.archived ? "Restore" : "Archive"}
            </Button>
          </>
        }
      />

      <Section title="Variants and stock">
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>In stock</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.variants.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.label}</TableCell>
                  <TableCell>
                    <span data-testid={`stock-${v.label}`}>{v.stock}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <AdjustStock variantId={v.id} label={v.label} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
        <AddVariant productId={product.id} />
      </Section>

      <Section title="Details">
        <Card>
          <CardContent className="space-y-4">
            <ProductForm
              key={`${product.name}-${product.price}-${product.costPrice}-${product.published}`}
              id="edit-product-form"
              initial={product}
              onSubmit={(values) =>
                run(
                  () => updateProduct({ data: { id: product.id, ...values } }),
                  "Product saved",
                )
              }
            />
            <Button type="submit" form="edit-product-form" disabled={busy}>
              Save
            </Button>
          </CardContent>
        </Card>
      </Section>

      <Section title="Stock movements">
        <TableCard data-testid="stock-moves">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.moves.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(m.at)}
                  </TableCell>
                  <TableCell>{m.label}</TableCell>
                  <TableCell>{m.delta > 0 ? `+${m.delta}` : m.delta}</TableCell>
                  <TableCell>{m.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </Section>
    </>
  );
}

function AddVariant({ productId }: { productId: string }) {
  const [label, setLabel] = useState("");
  const [stock, setStock] = useState("0");
  const { run, busy } = useAction();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await run(() =>
            addVariant({ data: { productId, label, stock: Number(stock) } }),
          )
        ) {
          setLabel("");
          setStock("0");
        }
      }}
    >
      <Field label="New variant" htmlFor="variant-label">
        <Input
          id="variant-label"
          data-testid="variant-label"
          placeholder="Size or colour"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>
      <Field label="Stock" htmlFor="variant-stock">
        <Input
          id="variant-stock"
          data-testid="variant-stock"
          type="number"
          min={0}
          className="w-24"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
      </Field>
      <Button
        type="submit"
        variant="outline"
        data-testid="add-variant"
        disabled={busy}
      >
        Add variant
      </Button>
    </form>
  );
}

function AdjustStock({
  variantId,
  label,
}: {
  variantId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const { run, busy } = useAction();
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        data-testid={`adjust-${label}`}
        onClick={() => setOpen(true)}
      >
        Adjust
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock: {label}</DialogTitle>
          </DialogHeader>
          <form
            id={`adjust-${variantId}`}
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  () =>
                    adjustStock({
                      data: { variantId, delta: Number(delta), reason },
                    }),
                  "Stock adjusted",
                )
              ) {
                setOpen(false);
                setDelta("");
                setReason("");
              }
            }}
          >
            <Field
              label="Change (+ to add, − to remove)"
              htmlFor={`delta-${variantId}`}
            >
              <Input
                id={`delta-${variantId}`}
                data-testid="adjust-delta"
                type="number"
                required
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
              />
            </Field>
            <Field label="Reason" htmlFor={`reason-${variantId}`}>
              <Input
                id={`reason-${variantId}`}
                data-testid="adjust-reason"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="submit"
              form={`adjust-${variantId}`}
              data-testid="adjust-save"
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
