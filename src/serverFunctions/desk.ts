import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { viewer } from "@/server/access";
import * as catalog from "@/server/catalog";
import * as orders from "@/server/orders";
import * as reports from "@/server/reports";
import * as store from "@/server/store";
import * as team from "@/server/team";

// Every function runs behind ensureUserMiddleware; the query layer checks
// what the person's role allows.
const parse =
  <T extends z.ZodTypeAny>(schema: T) =>
  (data: unknown): z.output<T> =>
    schema.parse(data);
const idOnly = z.object({ id: z.string() }).strict();
const numberId = z.object({ id: z.coerce.number().int() }).strict();

export const getMe = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    const v = await viewer(context.user);
    return { email: v.email, admin: v.admin, role: v.role };
  });

// Orders and customers.
export const getOrders = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator(parse(orders.listOrdersInput))
  .handler(async ({ data, context }) =>
    orders.listOrders(await viewer(context.user), data),
  );
export const getOrder = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator(parse(numberId))
  .handler(async ({ data, context }) =>
    orders.getOrder(await viewer(context.user), data.id),
  );
export const recordOutcome = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(orders.outcomeInput))
  .handler(async ({ data, context }) =>
    orders.recordOutcome(await viewer(context.user), data),
  );
export const confirmOrder = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(orders.idInput))
  .handler(async ({ data, context }) =>
    orders.confirmOrder(await viewer(context.user), data),
  );
export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(orders.idInput))
  .handler(async ({ data, context }) =>
    orders.cancelOrder(await viewer(context.user), data),
  );
export const editOrder = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(orders.editOrderInput))
  .handler(async ({ data, context }) =>
    orders.editOrder(await viewer(context.user), data),
  );
export const reassignOrder = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(orders.reassignInput))
  .handler(async ({ data, context }) =>
    orders.reassignOrder(await viewer(context.user), data),
  );
export const getCustomers = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) =>
    orders.listCustomers(await viewer(context.user)),
  );
export const blockPhone = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(orders.phoneInput))
  .handler(async ({ data, context }) =>
    orders.blockPhone(await viewer(context.user), data),
  );
export const unblockPhone = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(orders.phoneInput))
  .handler(async ({ data, context }) =>
    orders.unblockPhone(await viewer(context.user), data),
  );

// Shipping.
export const getShipping = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator(parse(orders.parcelsInput))
  .handler(async ({ data, context }) =>
    orders.shippingBoard(await viewer(context.user), data),
  );
export const shipOrders = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(orders.shipInput))
  .handler(async ({ data, context }) =>
    orders.shipOrders(await viewer(context.user), data),
  );
export const setParcelStatus = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(orders.parcelStatusInput))
  .handler(async ({ data, context }) =>
    orders.setParcelStatus(await viewer(context.user), data),
  );
export const getSlip = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator(parse(numberId))
  .handler(async ({ data, context }) =>
    orders.slip(await viewer(context.user), data.id),
  );

// Products and stock.
export const getProducts = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) =>
    catalog.listProducts(await viewer(context.user)),
  );
export const getProduct = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator(parse(idOnly))
  .handler(async ({ data, context }) =>
    catalog.getProduct(await viewer(context.user), data.id),
  );
export const createProduct = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(catalog.createProductInput))
  .handler(async ({ data, context }) =>
    catalog.createProduct(await viewer(context.user), data),
  );
export const updateProduct = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(catalog.updateProductInput))
  .handler(async ({ data, context }) =>
    catalog.updateProduct(await viewer(context.user), data),
  );
export const archiveProduct = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(catalog.archiveProductInput))
  .handler(async ({ data, context }) =>
    catalog.archiveProduct(await viewer(context.user), data),
  );
export const addVariant = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(catalog.addVariantInput))
  .handler(async ({ data, context }) =>
    catalog.addVariant(await viewer(context.user), data),
  );
export const adjustStock = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(catalog.adjustStockInput))
  .handler(async ({ data, context }) =>
    catalog.adjustStock(await viewer(context.user), data),
  );

// Profit and campaigns.
export const getProfit = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator(parse(reports.monthInput))
  .handler(async ({ data, context }) =>
    reports.profit(await viewer(context.user), data),
  );
export const getCampaigns = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator(parse(reports.monthInput))
  .handler(async ({ data, context }) => {
    const result = await reports.listCampaigns(
      await viewer(context.user),
      data,
    );
    // Links point at this install's own address, taken from the request.
    return { ...result, storeUrl: new URL("/s", getRequest().url).href };
  });
export const createCampaign = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(reports.campaignInput))
  .handler(async ({ data, context }) =>
    reports.createCampaign(await viewer(context.user), data),
  );
export const setSpend = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(reports.spendInput))
  .handler(async ({ data, context }) =>
    reports.setSpend(await viewer(context.user), data),
  );

// Team and settings.
export const getTeam = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => team.listStaff(await viewer(context.user)));
export const setRole = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(team.setRoleInput))
  .handler(async ({ data, context }) =>
    team.setRole(await viewer(context.user), data),
  );
export const getSettings = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    const v = await viewer(context.user);
    if (!v.admin) throw new Error("Only an admin can do that.");
    const [storeName, fees, callStatuses] = await Promise.all([
      store.storeName(),
      store.feeTable(),
      store.listCallStatuses(),
    ]);
    return { storeName, fees, callStatuses };
  });
export const saveSettings = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(store.saveSettingsInput))
  .handler(async ({ data, context }) =>
    store.saveSettings(await viewer(context.user), data),
  );
export const addCallStatus = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(store.addCallStatusInput))
  .handler(async ({ data, context }) =>
    store.addCallStatus(await viewer(context.user), data),
  );
export const removeCallStatus = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(parse(store.removeCallStatusInput))
  .handler(async ({ data, context }) =>
    store.removeCallStatus(await viewer(context.user), data),
  );
