import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { requireAdmin, type Viewer } from "./access";

export async function listStaff(v: Viewer) {
  requireAdmin(v);
  return db.select().from(staff).orderBy(asc(staff.email));
}

export const setRoleInput = z
  .object({
    userId: z.string(),
    role: z.enum(["none", "confirmer", "shipper"]),
    active: z.boolean(),
  })
  .strict();

export async function setRole(v: Viewer, input: z.infer<typeof setRoleInput>) {
  requireAdmin(v);
  await db
    .update(staff)
    .set({ role: input.role, active: input.active })
    .where(eq(staff.userId, input.userId));
}
