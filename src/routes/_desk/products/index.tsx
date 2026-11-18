import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { AdminOnly } from "@/client/components/desk/AdminOnly";
import { ProductForm } from "@/client/components/desk/ProductForm";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
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
import { formatDA } from "@/lib/format";
import { createProduct, getProducts } from "@/serverFunctions/desk";

const LOW_STOCK = 5;

export const Route = createFileRoute("/_desk/products/")({
  loader: ({ context }) => (context.me.admin ? getProducts() : null),
  component: Products,
});

function Products() {
  const products = Route.useLoaderData();
  if (!products) {
    return (
      <>
        <PageHeader title="Products" />
        <AdminOnly />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Products" actions={<NewProduct />} />
      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Add one and it appears in your store once it has a variant."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Store</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id} data-testid="product-row">
                  <TableCell>
                    <Link
                      to="/products/$id"
                      params={{ id: p.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.name}
                    </Link>
                    <div className="text-muted-foreground">
                      {p.variants} {p.variants === 1 ? "variant" : "variants"}
                    </div>
                  </TableCell>
                  <TableCell>{formatDA(p.price)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {p.stock}
                      {p.lowest !== null && p.lowest <= 0 ? (
                        <Badge variant="destructive" data-testid="low-stock">
                          Out of stock
                        </Badge>
                      ) : p.lowest !== null && p.lowest <= LOW_STOCK ? (
                        <Badge variant="warning" data-testid="low-stock">
                          Low stock
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.archived ? (
                      <Badge variant="secondary">Archived</Badge>
                    ) : p.published ? (
                      <Badge variant="success">Shown</Badge>
                    ) : (
                      <Badge variant="outline">Hidden</Badge>
                    )}
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

function NewProduct() {
  const [open, setOpen] = useState(false);
  const { run, busy } = useAction();
  const navigate = useNavigate();
  return (
    <>
      <Button data-testid="new-product" onClick={() => setOpen(true)}>
        <Plus /> New product
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New product</DialogTitle>
          </DialogHeader>
          <ProductForm
            id="new-product-form"
            initial={{
              name: "",
              description: "",
              price: 0,
              costPrice: 0,
              published: true,
            }}
            onSubmit={(values) =>
              run(async () => {
                const { id } = await createProduct({ data: values });
                setOpen(false);
                await navigate({ to: "/products/$id", params: { id } });
              })
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="submit"
              form="new-product-form"
              data-testid="product-save"
              disabled={busy}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
