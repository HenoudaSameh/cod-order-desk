// The app's tools for AI clients, served by the Gateway at /mcp. Each calls
// the same queries as the pages, with the same role checks.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { viewer } from "@/server/access";
import * as orders from "@/server/orders";

export const tools = defineTools({
  list_orders: {
    description:
      "List orders the user may see. view: due (pending, to call now), later (call back on a later date) or all.",
    risk: "read",
    input: orders.listOrdersInput,
    handler: async (input, { user }) =>
      orders.listOrders(await viewer(user), input),
  },
  list_customers: {
    description:
      "List customers by phone with their order, delivered and returned counts and whether the phone is blocked.",
    risk: "read",
    input: z.object({}).strict(),
    handler: async (_input, { user }) =>
      orders.listCustomers(await viewer(user)),
  },
});
