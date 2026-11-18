import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as store from "@/server/store";

// The public store's reads. No user: these pages are open to anyone and
// return only published products, prices and delivery fees.
export const getCatalog = createServerFn().handler(() => store.publicCatalog());

export const getStoreProduct = createServerFn()
  .validator((data: unknown) =>
    z.object({ slug: z.string().max(80) }).parse(data),
  )
  .handler(({ data }) => store.publicProduct(data.slug));
