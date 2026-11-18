import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderEvents, orders, staff } from "@/db/schema";

/** How long a pending order may sit untouched before it moves on. */
const UNTOUCHED_MS = 2 * 60 * 60 * 1000;

/** The next active confirmer in turn (round-robin), skipping `except`. */
export async function assignNext(except: string | null) {
  const [next] = await db
    .select({ userId: staff.userId, email: staff.email })
    .from(staff)
    .where(
      and(
        eq(staff.role, "confirmer"),
        eq(staff.active, true),
        except ? ne(staff.userId, except) : undefined,
      ),
    )
    .orderBy(
      sql`coalesce(${staff.lastAssignedAt}, '')`,
      asc(staff.createdAt),
      asc(staff.userId),
    )
    .limit(1);
  if (!next) return null;
  await db
    .update(staff)
    .set({ lastAssignedAt: new Date().toISOString() })
    .where(eq(staff.userId, next.userId));
  return next;
}

/** Hands pending orders nobody has touched for a while to the next confirmer. */
export async function reassignUntouched(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - UNTOUCHED_MS).toISOString();
  const stale = await db
    .select({ id: orders.id, assigneeId: orders.assigneeId })
    .from(orders)
    .where(
      and(
        eq(orders.status, "pending"),
        sql`${orders.touchedAt} < ${cutoff}`,
        sql`${orders.callbackOn} is null`,
      ),
    )
    .limit(200);
  let moved = 0;
  for (const order of stale) {
    const next = await assignNext(order.assigneeId);
    if (!next) continue;
    await db.batch([
      db
        .update(orders)
        .set({
          assigneeId: next.userId,
          touchedAt: new Date(now).toISOString(),
        })
        .where(and(eq(orders.id, order.id), eq(orders.status, "pending"))),
      db.insert(orderEvents).values({
        id: crypto.randomUUID(),
        orderId: order.id,
        text: `Untouched for 2 hours, handed to ${next.email}`,
      }),
    ]);
    moved++;
  }
  return moved;
}
