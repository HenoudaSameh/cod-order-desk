import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  blockedPhones,
  callStatuses,
  deliveryFees,
  orderEvents,
  orders,
  products,
  storeSettings,
  variants,
} from "@/db/schema";
import { normalizePhone } from "@/lib/format";
import { WILAYAS } from "@/lib/wilayas";
import { requireAdmin, type Viewer } from "./access";
import { assignNext } from "./assign";

const DEFAULT_STORE_NAME = "Our store";

export interface Fee {
  wilaya: number;
  homeFee: number | null;
  officeFee: number | null;
  returnFee: number;
}

export async function storeName(): Promise<string> {
  const [row] = await db.select().from(storeSettings).limit(1);
  return row?.storeName ?? DEFAULT_STORE_NAME;
}

/** All 58 provinces, with the fees set for each (null when none). */
export async function feeTable(): Promise<Fee[]> {
  const rows = await db.select().from(deliveryFees);
  const byCode = new Map(rows.map((r) => [r.wilaya, r]));
  return WILAYAS.map((_, i) => {
    const r = byCode.get(i + 1);
    return {
      wilaya: i + 1,
      homeFee: r?.homeFee ?? null,
      officeFee: r?.officeFee ?? null,
      returnFee: r?.returnFee ?? 0,
    };
  });
}

const fee = z.number().int().min(0).max(100000).nullable();
export const saveSettingsInput = z
  .object({
    storeName: z.string().trim().min(1, "Store name is required").max(80),
    fees: z
      .array(
        z.object({
          wilaya: z.number().int().min(1).max(58),
          homeFee: fee,
          officeFee: fee,
          returnFee: z.number().int().min(0).max(100000),
        }),
      )
      .max(58),
  })
  .strict();

export async function saveSettings(
  v: Viewer,
  input: z.infer<typeof saveSettingsInput>,
): Promise<void> {
  requireAdmin(v);
  await db.batch([
    db
      .insert(storeSettings)
      .values({ id: 1, storeName: input.storeName })
      .onConflictDoUpdate({
        target: storeSettings.id,
        set: { storeName: input.storeName },
      }),
    db.delete(deliveryFees),
    ...input.fees
      .filter((f) => f.homeFee !== null || f.officeFee !== null)
      .map((f) => db.insert(deliveryFees).values(f)),
  ]);
}

export function listCallStatuses() {
  return db.select().from(callStatuses).orderBy(asc(callStatuses.label));
}

export const addCallStatusInput = z
  .object({ label: z.string().trim().min(1).max(60) })
  .strict();

export async function addCallStatus(
  v: Viewer,
  input: z.infer<typeof addCallStatusInput>,
) {
  requireAdmin(v);
  await db
    .insert(callStatuses)
    .values({ id: crypto.randomUUID(), label: input.label });
}

export const removeCallStatusInput = z.object({ id: z.string() }).strict();

export async function removeCallStatus(
  v: Viewer,
  input: z.infer<typeof removeCallStatusInput>,
) {
  requireAdmin(v);
  await db.delete(callStatuses).where(eq(callStatuses.id, input.id));
}

// The public store: published, unarchived products and their prices only.

const onSale = and(
  eq(products.published, true),
  eq(products.archived, false),
  sql`exists (select 1 from variants v where v.product_id = ${products.id})`,
);

export async function publicCatalog() {
  const [name, list] = await Promise.all([
    storeName(),
    db
      .select({
        slug: products.slug,
        name: products.name,
        description: products.description,
        price: products.price,
      })
      .from(products)
      .where(onSale)
      .orderBy(asc(products.name)),
  ]);
  return { storeName: name, products: list };
}

export async function publicProduct(slug: string) {
  const [product] = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      description: products.description,
      price: products.price,
    })
    .from(products)
    .where(and(eq(products.slug, slug), onSale));
  if (!product) return null;
  const [name, options, fees] = await Promise.all([
    storeName(),
    db
      .select({ id: variants.id, label: variants.label })
      .from(variants)
      .where(eq(variants.productId, product.id))
      .orderBy(asc(variants.label)),
    feeTable(),
  ]);
  const { id: _id, ...shown } = product;
  return { storeName: name, product: shown, variants: options, fees };
}

export const placeOrderInput = z.object({
  variantId: z.string().min(1).max(64),
  name: z.string().trim().min(2, "Enter your full name").max(80),
  phone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.string().regex(/^0\d{8,9}$/, "Enter a valid phone number")),
  wilaya: z.number().int().min(1).max(58),
  commune: z.string().trim().min(1, "Enter your commune").max(80),
  address: z.string().trim().min(1, "Enter your address").max(200),
  deliveryType: z.enum(["home", "office"]),
  quantity: z.number().int().min(1).max(20),
  campaign: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,40}$/)
    .optional()
    .catch(undefined),
});

export class OrderRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A visitor's order. Price, cost and fee come from the store, never the form. */
export async function placeOrder(
  input: z.infer<typeof placeOrderInput>,
): Promise<{ merged: boolean }> {
  const [item] = await db
    .select({
      productId: products.id,
      price: products.price,
      cost: products.costPrice,
      label: variants.label,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(variants.id, input.variantId), onSale));
  if (!item) throw new OrderRefused(404, "This product is not available.");

  const [blocked] = await db
    .select()
    .from(blockedPhones)
    .where(eq(blockedPhones.phone, input.phone));
  if (blocked)
    throw new OrderRefused(403, "We can't take an order from this number.");

  const [feeRow] = await db
    .select()
    .from(deliveryFees)
    .where(eq(deliveryFees.wilaya, input.wilaya));
  const deliveryFee =
    input.deliveryType === "home" ? feeRow?.homeFee : feeRow?.officeFee;
  if (deliveryFee === null || deliveryFee === undefined)
    throw new OrderRefused(400, "We don't deliver there yet.");

  const [pending] = await db
    .select({ id: orders.id, quantity: orders.quantity })
    .from(orders)
    .where(
      and(
        eq(orders.phone, input.phone),
        eq(orders.variantId, input.variantId),
        eq(orders.status, "pending"),
      ),
    )
    .limit(1);
  if (pending) {
    await db.batch([
      db
        .update(orders)
        .set({ quantity: pending.quantity + input.quantity })
        .where(eq(orders.id, pending.id)),
      db.insert(orderEvents).values({
        id: crypto.randomUUID(),
        orderId: pending.id,
        text: `Repeat order merged (+${input.quantity})`,
      }),
    ]);
    return { merged: true };
  }

  const assignee = await assignNext(null);
  const [order] = await db
    .insert(orders)
    .values({
      productId: item.productId,
      variantId: input.variantId,
      quantity: input.quantity,
      unitPrice: item.price,
      unitCost: item.cost,
      deliveryFee,
      deliveryType: input.deliveryType,
      customerName: input.name,
      phone: input.phone,
      wilaya: input.wilaya,
      commune: input.commune,
      address: input.address,
      assigneeId: assignee?.userId ?? null,
      campaignCode: input.campaign?.toUpperCase() ?? null,
    })
    .returning({ id: orders.id });
  await db.insert(orderEvents).values({
    id: crypto.randomUUID(),
    orderId: order!.id,
    text:
      `Placed from the store` +
      (input.campaign ? ` (campaign ${input.campaign.toUpperCase()})` : "") +
      (assignee ? `, assigned to ${assignee.email}` : ""),
  });
  return { merged: false };
}
