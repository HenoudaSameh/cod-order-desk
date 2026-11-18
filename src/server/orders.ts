import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import {
  blockedPhones,
  callStatuses,
  deliveryFees,
  orderEvents,
  orders,
  products,
  staff,
  variants,
} from "@/db/schema";
import { normalizePhone, STATUS_LABELS } from "@/lib/format";
import {
  canConfirm,
  canShip,
  Forbidden,
  NotFound,
  requireAdmin,
  type Viewer,
} from "./access";
import { feeTable } from "./store";

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();

/** Which orders a person may see: admins all, confirmers theirs, shippers from confirmed on. */
function scope(v: Viewer): SQL | undefined | false {
  if (v.admin) return undefined;
  if (v.role === "confirmer") return eq(orders.assigneeId, v.id);
  if (v.role === "shipper")
    return notInArray(orders.status, ["pending", "cancelled"]);
  return false;
}

export const listOrdersInput = z
  .object({ view: z.enum(["due", "later", "all"]).catch("due") })
  .strict();

export async function listOrders(
  v: Viewer,
  { view }: z.infer<typeof listOrdersInput>,
) {
  const visible = scope(v);
  if (visible === false) return [];
  const filter =
    view === "due"
      ? and(
          eq(orders.status, "pending"),
          or(isNull(orders.callbackOn), lte(orders.callbackOn, today())),
        )
      : view === "later"
        ? and(eq(orders.status, "pending"), gt(orders.callbackOn, today()))
        : undefined;
  return db
    .select({
      id: orders.id,
      customerName: orders.customerName,
      phone: orders.phone,
      wilaya: orders.wilaya,
      product: products.name,
      variant: variants.label,
      quantity: orders.quantity,
      total: sql<number>`${orders.unitPrice} * ${orders.quantity} + ${orders.deliveryFee}`,
      status: orders.status,
      lastOutcome: orders.lastOutcome,
      callbackOn: orders.callbackOn,
      assignee: staff.email,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .innerJoin(variants, eq(variants.id, orders.variantId))
    .leftJoin(staff, eq(staff.userId, orders.assigneeId))
    .where(and(visible, filter))
    .orderBy(desc(orders.id))
    .limit(500);
}

async function visibleOrder(v: Viewer, id: number) {
  const visible = scope(v);
  if (visible === false) throw new NotFound("No order with that number.");
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), visible));
  if (!order) throw new NotFound("No order with that number.");
  return order;
}

function canWork(v: Viewer, order: { assigneeId: string | null }) {
  return v.admin || (v.role === "confirmer" && order.assigneeId === v.id);
}

export async function phoneHistory(phone: string) {
  const [row] = await db
    .select({
      orders: sql<number>`count(*)`,
      delivered: sql<number>`sum(case when ${orders.status} = 'delivered' then 1 else 0 end)`,
      returned: sql<number>`sum(case when ${orders.status} = 'returned' then 1 else 0 end)`,
    })
    .from(orders)
    .where(eq(orders.phone, phone));
  const [blocked] = await db
    .select()
    .from(blockedPhones)
    .where(eq(blockedPhones.phone, phone));
  return {
    orders: row?.orders ?? 0,
    delivered: row?.delivered ?? 0,
    returned: row?.returned ?? 0,
    blocked: Boolean(blocked),
  };
}

export async function getOrder(v: Viewer, id: number) {
  const order = await visibleOrder(v, id);
  const [
    [product],
    productVariants,
    events,
    history,
    statuses,
    confirmers,
    fees,
    [assignee],
  ] = await Promise.all([
    db
      .select({ name: products.name })
      .from(products)
      .where(eq(products.id, order.productId)),
    db
      .select()
      .from(variants)
      .where(eq(variants.productId, order.productId))
      .orderBy(asc(variants.label)),
    db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id))
      .orderBy(desc(orderEvents.at)),
    phoneHistory(order.phone),
    db.select().from(callStatuses).orderBy(asc(callStatuses.label)),
    v.admin
      ? db
          .select({ userId: staff.userId, email: staff.email })
          .from(staff)
          .where(eq(staff.role, "confirmer"))
          .orderBy(asc(staff.email))
      : Promise.resolve([]),
    feeTable(),
    order.assigneeId
      ? db
          .select({ email: staff.email })
          .from(staff)
          .where(eq(staff.userId, order.assigneeId))
      : Promise.resolve([]),
  ]);
  const variant = productVariants.find((x) => x.id === order.variantId);
  const work = canWork(v, order);
  return {
    order,
    product: product?.name ?? "",
    variant: variant?.label ?? "",
    stock: variant?.stock ?? 0,
    variants: productVariants.map((x) => ({ id: x.id, label: x.label })),
    assignee: assignee?.email ?? null,
    history,
    events,
    callStatuses: statuses,
    confirmers,
    fees,
    can: {
      call: work && order.status === "pending",
      edit:
        work && (order.status === "pending" || order.status === "confirmed"),
      reassign: v.admin && order.status === "pending",
      ship: canShip(v),
    },
  };
}

function event(orderId: number, v: Viewer, text: string) {
  return db.insert(orderEvents).values({
    id: crypto.randomUUID(),
    orderId,
    actorEmail: v.email,
    text,
  });
}

async function workable(v: Viewer, id: number, statuses: string[]) {
  const order = await visibleOrder(v, id);
  if (!canWork(v, order))
    throw new Forbidden("This order isn't yours to work on.");
  if (!statuses.includes(order.status))
    throw new Forbidden(
      `This order is ${STATUS_LABELS[order.status]?.toLowerCase()}.`,
    );
  return order;
}

export const outcomeInput = z
  .object({
    id: z.number().int(),
    outcome: z.string().min(1).max(80),
    callbackOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

export async function recordOutcome(
  v: Viewer,
  input: z.infer<typeof outcomeInput>,
) {
  const order = await workable(v, input.id, ["pending"]);
  let label: string;
  let callbackOn: string | null = null;
  if (input.outcome === "no_answer") label = "No answer";
  else if (input.outcome === "callback") {
    if (!input.callbackOn || input.callbackOn <= today())
      throw new Error("Pick a date after today.");
    callbackOn = input.callbackOn;
    label = `Call back on ${input.callbackOn}`;
  } else {
    const [status] = await db
      .select()
      .from(callStatuses)
      .where(eq(callStatuses.id, input.outcome.replace(/^status:/, "")));
    if (!status) throw new Error("Unknown call outcome.");
    label = status.label;
  }
  await db.batch([
    db
      .update(orders)
      .set({ lastOutcome: label, callbackOn, touchedAt: nowIso() })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending"))),
    event(order.id, v, label),
  ]);
}

export const idInput = z.object({ id: z.number().int() }).strict();

export async function confirmOrder(v: Viewer, { id }: z.infer<typeof idInput>) {
  const order = await workable(v, id, ["pending"]);
  const t = nowIso();
  await db.batch([
    db
      .update(orders)
      .set({
        status: "confirmed",
        statusChangedAt: t,
        touchedAt: t,
        callbackOn: null,
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending"))),
    event(order.id, v, "Confirmed"),
  ]);
}

export async function cancelOrder(v: Viewer, { id }: z.infer<typeof idInput>) {
  const order = await workable(v, id, ["pending", "confirmed"]);
  const t = nowIso();
  await db.batch([
    db
      .update(orders)
      .set({
        status: "cancelled",
        statusChangedAt: t,
        touchedAt: t,
        callbackOn: null,
      })
      .where(
        and(
          eq(orders.id, order.id),
          inArray(orders.status, ["pending", "confirmed"]),
        ),
      ),
    event(order.id, v, "Cancelled"),
  ]);
}

export const editOrderInput = z
  .object({
    id: z.number().int(),
    customerName: z.string().trim().min(2).max(80),
    phone: z
      .string()
      .transform(normalizePhone)
      .pipe(z.string().regex(/^0\d{8,9}$/, "Enter a valid phone number")),
    wilaya: z.number().int().min(1).max(58),
    commune: z.string().trim().min(1).max(80),
    address: z.string().trim().min(1).max(200),
    deliveryType: z.enum(["home", "office"]),
    variantId: z.string(),
    quantity: z.number().int().min(1).max(100),
  })
  .strict();

export async function editOrder(
  v: Viewer,
  { id, ...input }: z.infer<typeof editOrderInput>,
) {
  const order = await workable(v, id, ["pending", "confirmed"]);
  const [variant] = await db
    .select()
    .from(variants)
    .where(
      and(
        eq(variants.id, input.variantId),
        eq(variants.productId, order.productId),
      ),
    );
  if (!variant) throw new Error("Pick a variant of this product.");
  const [fee] = await db
    .select()
    .from(deliveryFees)
    .where(eq(deliveryFees.wilaya, input.wilaya));
  const deliveryFee =
    input.deliveryType === "home" ? fee?.homeFee : fee?.officeFee;
  if (deliveryFee === null || deliveryFee === undefined)
    throw new Error(
      "There's no delivery fee for that province and delivery type.",
    );
  await db.batch([
    db
      .update(orders)
      .set({ ...input, deliveryFee, touchedAt: nowIso() })
      .where(
        and(
          eq(orders.id, id),
          inArray(orders.status, ["pending", "confirmed"]),
        ),
      ),
    event(id, v, "Edited"),
  ]);
}

export const reassignInput = z
  .object({ id: z.number().int(), userId: z.string() })
  .strict();

export async function reassignOrder(
  v: Viewer,
  input: z.infer<typeof reassignInput>,
) {
  requireAdmin(v);
  const [target] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.userId, input.userId), eq(staff.role, "confirmer")));
  if (!target) throw new Error("Pick a confirmer.");
  await db.batch([
    db
      .update(orders)
      .set({ assigneeId: target.userId, touchedAt: nowIso() })
      .where(and(eq(orders.id, input.id), eq(orders.status, "pending"))),
    event(input.id, v, `Reassigned to ${target.email}`),
  ]);
}

// Customers: orders grouped by phone.

export async function listCustomers(v: Viewer) {
  if (!canConfirm(v)) return [];
  const mine = v.admin ? undefined : eq(orders.assigneeId, v.id);
  const phones = v.admin
    ? undefined
    : inArray(
        orders.phone,
        db.select({ phone: orders.phone }).from(orders).where(mine),
      );
  const rows = await db
    .select({
      phone: orders.phone,
      name: sql<string>`(select o2.customer_name from orders o2 where o2.phone = ${orders.phone} order by o2.id desc limit 1)`,
      orders: sql<number>`count(*)`,
      delivered: sql<number>`sum(case when ${orders.status} = 'delivered' then 1 else 0 end)`,
      returned: sql<number>`sum(case when ${orders.status} = 'returned' then 1 else 0 end)`,
      blocked: sql<number>`exists(select 1 from blocked_phones b where b.phone = ${orders.phone})`,
      lastOrder: sql<string>`max(${orders.createdAt})`,
    })
    .from(orders)
    .where(phones)
    .groupBy(orders.phone)
    .orderBy(sql`max(${orders.createdAt}) desc`)
    .limit(1000);
  return rows.map((r) => ({ ...r, blocked: Boolean(r.blocked) }));
}

export const phoneInput = z
  .object({
    phone: z.string().transform(normalizePhone).pipe(z.string().min(6)),
  })
  .strict();

export async function blockPhone(
  v: Viewer,
  { phone }: z.infer<typeof phoneInput>,
) {
  requireAdmin(v);
  await db.insert(blockedPhones).values({ phone }).onConflictDoNothing();
}

export async function unblockPhone(
  v: Viewer,
  { phone }: z.infer<typeof phoneInput>,
) {
  requireAdmin(v);
  await db.delete(blockedPhones).where(eq(blockedPhones.phone, phone));
}

// Shipping.

const STALE_MS = 4 * 24 * 60 * 60 * 1000;
const IN_FLIGHT = ["shipped", "in_transit", "out_for_delivery"];
const NEXT: Record<string, string[]> = {
  shipped: ["in_transit", "out_for_delivery", "delivered", "returned"],
  in_transit: ["out_for_delivery", "delivered", "returned"],
  out_for_delivery: ["delivered", "returned"],
};

function requireShipper(v: Viewer) {
  if (!canShip(v)) throw new Forbidden("Only shippers and admins can do that.");
}

const parcelFields = {
  id: orders.id,
  customerName: orders.customerName,
  phone: orders.phone,
  wilaya: orders.wilaya,
  commune: orders.commune,
  product: products.name,
  variant: variants.label,
  quantity: orders.quantity,
  total: sql<number>`${orders.unitPrice} * ${orders.quantity} + ${orders.deliveryFee}`,
  status: orders.status,
  carrier: orders.carrier,
  tracking: orders.tracking,
  statusChangedAt: orders.statusChangedAt,
};

export const parcelsInput = z
  .object({
    status: z
      .enum(["all", "stale", ...Object.keys(STATUS_LABELS)])
      .catch("all"),
  })
  .strict();

export async function shippingBoard(
  v: Viewer,
  { status }: z.infer<typeof parcelsInput>,
) {
  if (!canShip(v)) return { ready: [], parcels: [] };
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const parcelFilter =
    status === "all"
      ? inArray(orders.status, [...IN_FLIGHT, "delivered", "returned"])
      : status === "stale"
        ? and(
            inArray(orders.status, IN_FLIGHT),
            sql`${orders.statusChangedAt} < ${staleBefore}`,
          )
        : eq(orders.status, status);
  const base = () =>
    db
      .select(parcelFields)
      .from(orders)
      .innerJoin(products, eq(products.id, orders.productId))
      .innerJoin(variants, eq(variants.id, orders.variantId));
  const [ready, parcels] = await Promise.all([
    base()
      .where(eq(orders.status, "confirmed"))
      .orderBy(asc(orders.id))
      .limit(500),
    base().where(parcelFilter).orderBy(desc(orders.statusChangedAt)).limit(500),
  ]);
  return {
    ready,
    parcels: parcels.map((p) => ({
      ...p,
      stale: IN_FLIGHT.includes(p.status) && p.statusChangedAt < staleBefore,
      next: NEXT[p.status] ?? [],
    })),
  };
}

export const shipInput = z
  .object({
    carrier: z.string().trim().min(1, "Name the courier or driver").max(80),
    parcels: z
      .array(
        z.object({ id: z.number().int(), tracking: z.string().trim().max(80) }),
      )
      .min(1)
      .max(100),
  })
  .strict();

/** Ships confirmed orders; stock falls once per order, in the same batch as the status change. */
export async function shipOrders(v: Viewer, input: z.infer<typeof shipInput>) {
  requireShipper(v);
  const t = nowIso();
  const statements = input.parcels.flatMap(({ id, tracking }) => {
    const guard = `EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND status = 'confirmed')`;
    return [
      env.DB.prepare(
        `INSERT INTO stock_moves (id, variant_id, delta, reason, order_id, actor_id, at)
         SELECT ?2, variant_id, -quantity, 'Order ' || id || ' shipped', id, ?3, ?4 FROM orders WHERE id = ?1 AND status = 'confirmed'`,
      ).bind(id, crypto.randomUUID(), v.id, t),
      env.DB.prepare(
        `UPDATE variants SET stock = stock - (SELECT quantity FROM orders WHERE id = ?1)
         WHERE id = (SELECT variant_id FROM orders WHERE id = ?1) AND ${guard}`,
      ).bind(id),
      env.DB.prepare(
        `INSERT INTO order_events (id, order_id, actor_email, text, at)
         SELECT ?2, ?1, ?3, ?4, ?5 WHERE ${guard}`,
      ).bind(
        id,
        crypto.randomUUID(),
        v.email,
        `Shipped with ${input.carrier}${tracking ? `, tracking ${tracking}` : ""}`,
        t,
      ),
      env.DB.prepare(
        `UPDATE orders SET status = 'shipped', carrier = ?2, tracking = ?3, status_changed_at = ?4, touched_at = ?4
         WHERE id = ?1 AND status = 'confirmed'`,
      ).bind(id, input.carrier, tracking || null, t),
    ];
  });
  await env.DB.batch(statements);
}

export const parcelStatusInput = z
  .object({
    id: z.number().int(),
    status: z.enum(["in_transit", "out_for_delivery", "delivered", "returned"]),
  })
  .strict();

/** Moves a parcel on; a return puts its items back in stock, once. */
export async function setParcelStatus(
  v: Viewer,
  { id, status }: z.infer<typeof parcelStatusInput>,
) {
  requireShipper(v);
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order || !(NEXT[order.status] ?? []).includes(status))
    throw new Error("That status change isn't possible.");
  const from = order.status;
  const t = nowIso();
  const guard = `EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND status = '${from}')`;
  const statements = [];
  if (status === "returned") {
    statements.push(
      env.DB.prepare(
        `INSERT INTO stock_moves (id, variant_id, delta, reason, order_id, actor_id, at)
         SELECT ?2, variant_id, quantity, 'Order ' || id || ' returned', id, ?3, ?4 FROM orders WHERE id = ?1 AND status = '${from}'`,
      ).bind(id, crypto.randomUUID(), v.id, t),
      env.DB.prepare(
        `UPDATE variants SET stock = stock + (SELECT quantity FROM orders WHERE id = ?1)
         WHERE id = (SELECT variant_id FROM orders WHERE id = ?1) AND ${guard}`,
      ).bind(id),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO order_events (id, order_id, actor_email, text, at) SELECT ?2, ?1, ?3, ?4, ?5 WHERE ${guard}`,
    ).bind(id, crypto.randomUUID(), v.email, STATUS_LABELS[status]!, t),
    env.DB.prepare(
      `UPDATE orders SET status = ?2, status_changed_at = ?3, touched_at = ?3 WHERE id = ?1 AND status = '${from}'`,
    ).bind(id, status, t),
  );
  await env.DB.batch(statements);
}

export async function slip(v: Viewer, id: number) {
  const order = await visibleOrder(v, id);
  if (!canShip(v) && !canWork(v, order))
    throw new NotFound("No order with that number.");
  const [item] = await db
    .select({ product: products.name, variant: variants.label })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(variants.id, order.variantId));
  return { order, product: item?.product ?? "", variant: item?.variant ?? "" };
}
