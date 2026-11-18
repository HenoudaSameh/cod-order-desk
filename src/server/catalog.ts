import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { products, stockMoves, variants } from "@/db/schema";
import { NotFound, requireAdmin, type Viewer } from "./access";

/** At or below this, a variant shows as low on stock. */
export const LOW_STOCK = 5;

export async function listProducts(v: Viewer) {
  requireAdmin(v);
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      published: products.published,
      archived: products.archived,
      variants: sql<number>`count(${variants.id})`,
      stock: sql<number>`coalesce(sum(${variants.stock}), 0)`,
      lowest: sql<number | null>`min(${variants.stock})`,
    })
    .from(products)
    .leftJoin(variants, eq(variants.productId, products.id))
    .groupBy(products.id)
    .orderBy(asc(products.archived), asc(products.name));
  return rows;
}

const productFields = {
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000),
  price: z.number().int().min(0).max(10_000_000),
  costPrice: z.number().int().min(0).max(10_000_000),
  published: z.boolean(),
};
export const createProductInput = z.object(productFields).strict();
export const updateProductInput = z
  .object({ id: z.string(), ...productFields })
  .strict();

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return base || "product";
}

export async function createProduct(
  v: Viewer,
  input: z.infer<typeof createProductInput>,
) {
  requireAdmin(v);
  const base = slugify(input.name);
  const taken = await db
    .select({ slug: products.slug })
    .from(products)
    .where(
      sql`${products.slug} = ${base} or ${products.slug} like ${base + "-%"}`,
    );
  const used = new Set(taken.map((t) => t.slug));
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  const id = crypto.randomUUID();
  await db.insert(products).values({ id, slug, ...input });
  return { id };
}

export async function updateProduct(
  v: Viewer,
  { id, ...input }: z.infer<typeof updateProductInput>,
) {
  requireAdmin(v);
  await db.update(products).set(input).where(eq(products.id, id));
}

export const archiveProductInput = z
  .object({ id: z.string(), archived: z.boolean() })
  .strict();

export async function archiveProduct(
  v: Viewer,
  input: z.infer<typeof archiveProductInput>,
) {
  requireAdmin(v);
  await db
    .update(products)
    .set({ archived: input.archived })
    .where(eq(products.id, input.id));
}

export async function getProduct(v: Viewer, id: string) {
  requireAdmin(v);
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) throw new NotFound("No product with that id.");
  const [list, moves] = await Promise.all([
    db
      .select()
      .from(variants)
      .where(eq(variants.productId, id))
      .orderBy(asc(variants.label)),
    db
      .select({
        id: stockMoves.id,
        label: variants.label,
        delta: stockMoves.delta,
        reason: stockMoves.reason,
        at: stockMoves.at,
      })
      .from(stockMoves)
      .innerJoin(variants, eq(variants.id, stockMoves.variantId))
      .where(eq(variants.productId, id))
      .orderBy(desc(stockMoves.at))
      .limit(100),
  ]);
  return { product, variants: list, moves };
}

export const addVariantInput = z
  .object({
    productId: z.string(),
    label: z.string().trim().min(1, "Label is required").max(60),
    stock: z.number().int().min(0).max(1_000_000),
  })
  .strict();

export async function addVariant(
  v: Viewer,
  input: z.infer<typeof addVariantInput>,
) {
  requireAdmin(v);
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, input.productId));
  if (!product) throw new NotFound("No product with that id.");
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(variants).values({ id, ...input }),
    db.insert(stockMoves).values({
      id: crypto.randomUUID(),
      variantId: id,
      delta: input.stock,
      reason: "Opening stock",
      actorId: v.id,
    }),
  ]);
}

export const adjustStockInput = z
  .object({
    variantId: z.string(),
    delta: z
      .number()
      .int()
      .refine((n) => n !== 0, "Enter a change other than 0"),
    reason: z.string().trim().min(1, "Give a reason").max(200),
  })
  .strict();

export async function adjustStock(
  v: Viewer,
  input: z.infer<typeof adjustStockInput>,
) {
  requireAdmin(v);
  const [variant] = await db
    .select()
    .from(variants)
    .where(eq(variants.id, input.variantId));
  if (!variant) throw new NotFound("No variant with that id.");
  await db.batch([
    db
      .update(variants)
      .set({ stock: sql`${variants.stock} + ${input.delta}` })
      .where(and(eq(variants.id, input.variantId))),
    db.insert(stockMoves).values({
      id: crypto.randomUUID(),
      variantId: input.variantId,
      delta: input.delta,
      reason: input.reason,
      actorId: v.id,
    }),
  ]);
}
