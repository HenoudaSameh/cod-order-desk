import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { db } from "@/db";
import { staff } from "@/db/schema";

export type Role = "none" | "confirmer" | "shipper";

export interface Viewer {
  id: string;
  email: string;
  admin: boolean;
  role: Role;
}

/** The person behind the request, recorded on first sight with the Gateway's email. */
export async function viewer(user: EveryAppUser): Promise<Viewer> {
  const [row] = await db
    .insert(staff)
    .values({ userId: user.id, email: user.email })
    .onConflictDoUpdate({ target: staff.userId, set: { email: user.email } })
    .returning();
  return {
    id: user.id,
    email: user.email,
    admin: isAdmin(user),
    role: (row?.role ?? "none") as Role,
  };
}

export class Forbidden extends Error {
  constructor(message = "Only an admin can do that.") {
    super(message);
    this.name = "Forbidden";
  }
}

export class NotFound extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFound";
  }
}

export function requireAdmin(v: Viewer): void {
  if (!v.admin) throw new Forbidden();
}

export function canConfirm(v: Viewer): boolean {
  return v.admin || v.role === "confirmer";
}

export function canShip(v: Viewer): boolean {
  return v.admin || v.role === "shipper";
}
