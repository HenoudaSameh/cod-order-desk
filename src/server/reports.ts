import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  adSpend,
  campaigns,
  deliveryFees,
  orders,
  products,
} from "@/db/schema";
import { requireAdmin, type Viewer } from "./access";

export const monthInput = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .catch(() => new Date().toISOString().slice(0, 7)),
  })
  .strict();

const inMonth = (month: string) =>
  sql`substr(${orders.statusChangedAt}, 1, 7) = ${month}`;

/** Delivered and returned counts per campaign code in a month. */
async function campaignResults(month: string) {
  return db
    .select({
      code: orders.campaignCode,
      delivered: sql<number>`sum(case when ${orders.status} = 'delivered' then 1 else 0 end)`,
    })
    .from(orders)
    .where(and(inMonth(month), sql`${orders.campaignCode} is not null`))
    .groupBy(orders.campaignCode);
}

export async function profit(v: Viewer, { month }: z.infer<typeof monthInput>) {
  requireAdmin(v);
  const [[delivered], [returns], [ads], byProduct] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`,
        collected: sql<number>`coalesce(sum(${orders.unitPrice} * ${orders.quantity} + ${orders.deliveryFee}), 0)`,
        productCost: sql<number>`coalesce(sum(${orders.unitCost} * ${orders.quantity}), 0)`,
        delivery: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)`,
      })
      .from(orders)
      .where(and(eq(orders.status, "delivered"), inMonth(month))),
    db
      .select({
        count: sql<number>`count(*)`,
        cost: sql<number>`coalesce(sum(coalesce(${deliveryFees.returnFee}, 0)), 0)`,
      })
      .from(orders)
      .leftJoin(deliveryFees, eq(deliveryFees.wilaya, orders.wilaya))
      .where(and(eq(orders.status, "returned"), inMonth(month))),
    db
      .select({ total: sql<number>`coalesce(sum(${adSpend.amount}), 0)` })
      .from(adSpend)
      .where(eq(adSpend.month, month)),
    db
      .select({
        name: products.name,
        delivered: sql<number>`sum(case when ${orders.status} = 'delivered' then ${orders.quantity} else 0 end)`,
        returned: sql<number>`sum(case when ${orders.status} = 'returned' then 1 else 0 end)`,
        revenue: sql<number>`sum(case when ${orders.status} = 'delivered' then ${orders.unitPrice} * ${orders.quantity} + ${orders.deliveryFee} else 0 end)`,
        cost: sql<number>`sum(case when ${orders.status} = 'delivered' then ${orders.unitCost} * ${orders.quantity} + ${orders.deliveryFee} else 0 end)`,
      })
      .from(orders)
      .innerJoin(products, eq(products.id, orders.productId))
      .where(
        and(sql`${orders.status} in ('delivered', 'returned')`, inMonth(month)),
      )
      .groupBy(products.id)
      .orderBy(asc(products.name)),
  ]);
  const d = delivered ?? {
    count: 0,
    collected: 0,
    productCost: 0,
    delivery: 0,
  };
  const returnCost = returns?.cost ?? 0;
  const adCost = ads?.total ?? 0;
  return {
    month,
    deliveredOrders: d.count,
    returnedOrders: returns?.count ?? 0,
    collected: d.collected,
    productCost: d.productCost,
    delivery: d.delivery,
    returns: returnCost,
    ads: adCost,
    net: d.collected - d.productCost - d.delivery - returnCost - adCost,
    products: byProduct.map((p) => ({ ...p, margin: p.revenue - p.cost })),
  };
}

export async function listCampaigns(
  v: Viewer,
  { month }: z.infer<typeof monthInput>,
) {
  requireAdmin(v);
  const [list, spend, results] = await Promise.all([
    db.select().from(campaigns).orderBy(asc(campaigns.code)),
    db.select().from(adSpend).where(eq(adSpend.month, month)),
    campaignResults(month),
  ]);
  const rows = list.map((c) => {
    const spent = spend.find((s) => s.campaignId === c.id)?.amount ?? 0;
    const delivered = results.find((r) => r.code === c.code)?.delivered ?? 0;
    return {
      ...c,
      spend: spent,
      delivered,
      costPerDelivered: delivered > 0 ? spent / delivered : null,
    };
  });
  const ranked = rows.filter((r) => r.costPerDelivered !== null);
  ranked.sort((a, b) => a.costPerDelivered! - b.costPerDelivered!);
  return { month, campaigns: rows, bestId: ranked[0]?.id ?? null };
}

export const campaignInput = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,40}$/, "Letters, digits, - and _ only")
      .transform((s) => s.toUpperCase()),
    name: z.string().trim().min(1, "Name is required").max(80),
  })
  .strict();

export async function createCampaign(
  v: Viewer,
  input: z.infer<typeof campaignInput>,
) {
  requireAdmin(v);
  const [taken] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.code, input.code));
  if (taken) throw new Error("A campaign already uses that code.");
  await db.insert(campaigns).values({ id: crypto.randomUUID(), ...input });
}

export const spendInput = z
  .object({
    campaignId: z.string(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    amount: z.number().int().min(0).max(1_000_000_000),
  })
  .strict();

export async function setSpend(v: Viewer, input: z.infer<typeof spendInput>) {
  requireAdmin(v);
  await db
    .insert(adSpend)
    .values(input)
    .onConflictDoUpdate({
      target: [adSpend.campaignId, adSpend.month],
      set: { amount: input.amount },
    });
}
