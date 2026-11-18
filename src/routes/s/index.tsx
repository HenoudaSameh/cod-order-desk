import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { StoreShell } from "@/client/components/StoreShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { formatDA } from "@/lib/format";
import { getCatalog } from "@/serverFunctions/storefront";

// Public (everyapp.config.ts): anyone may open the store.
export const Route = createFileRoute("/s/")({
  loader: () => getCatalog(),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.storeName }] : [],
  }),
  component: Store,
});

function Store() {
  const { storeName, products } = Route.useLoaderData();
  return (
    <StoreShell storeName={storeName}>
      <PageHeader
        title={storeName}
        description="Pay in cash when your order arrives."
      />
      {products.length === 0 ? (
        <EmptyState title="Nothing for sale right now" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {products.map((p) => (
            // A full page load: the store pages carry no client-side data calls.
            <a key={p.slug} href={`/s/p/${p.slug}`} className="block">
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader>
                  <CardTitle>{p.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="line-clamp-3 text-muted-foreground">
                    {p.description}
                  </p>
                  <p className="text-base font-semibold">{formatDA(p.price)}</p>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      )}
    </StoreShell>
  );
}
