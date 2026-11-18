import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/** Everyone who has opened the app, keyed by the Gateway's user id. */
export const staff = sqliteTable("staff", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  /** none | confirmer | shipper */
  role: text("role").notNull().default("none"),
  /** Confirmers take new orders only while active. */
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastAssignedAt: text("last_assigned_at"),
  createdAt: text("created_at").notNull().default(now),
});

/** The single store: its name. */
export const storeSettings = sqliteTable("store_settings", {
  id: integer("id").primaryKey(),
  storeName: text("store_name").notNull(),
});

/** Delivery fees per province; null means that delivery type is unavailable. */
export const deliveryFees = sqliteTable("delivery_fees", {
  wilaya: integer("wilaya").primaryKey(),
  homeFee: integer("home_fee"),
  officeFee: integer("office_fee"),
  returnFee: integer("return_fee").notNull().default(0),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  price: integer("price").notNull(),
  costPrice: integer("cost_price").notNull(),
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now),
});

export const variants = sqliteTable(
  "variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    label: text("label").notNull(),
    stock: integer("stock").notNull().default(0),
  },
  (t) => [index("variants_product").on(t.productId)],
);

export const stockMoves = sqliteTable(
  "stock_moves",
  {
    id: text("id").primaryKey(),
    variantId: text("variant_id")
      .notNull()
      .references(() => variants.id),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    orderId: integer("order_id"),
    actorId: text("actor_id"),
    at: text("at").notNull().default(now),
  },
  (t) => [index("stock_moves_variant").on(t.variantId)],
);

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    variantId: text("variant_id")
      .notNull()
      .references(() => variants.id),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    unitCost: integer("unit_cost").notNull(),
    deliveryFee: integer("delivery_fee").notNull(),
    /** home | office */
    deliveryType: text("delivery_type").notNull(),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    wilaya: integer("wilaya").notNull(),
    commune: text("commune").notNull(),
    address: text("address").notNull(),
    /** pending | confirmed | cancelled | shipped | in_transit | out_for_delivery | delivered | returned */
    status: text("status").notNull().default("pending"),
    assigneeId: text("assignee_id"),
    campaignCode: text("campaign_code"),
    lastOutcome: text("last_outcome"),
    callbackOn: text("callback_on"),
    carrier: text("carrier"),
    tracking: text("tracking"),
    statusChangedAt: text("status_changed_at").notNull().default(now),
    touchedAt: text("touched_at").notNull().default(now),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [
    index("orders_status").on(t.status),
    index("orders_phone").on(t.phone),
    index("orders_assignee").on(t.assigneeId),
  ],
);

export const orderEvents = sqliteTable(
  "order_events",
  {
    id: text("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id),
    actorEmail: text("actor_email"),
    text: text("text").notNull(),
    at: text("at").notNull().default(now),
  },
  (t) => [index("order_events_order").on(t.orderId)],
);

/** Call outcomes an admin adds beside "No answer" and "Call back". */
export const callStatuses = sqliteTable("call_statuses", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
});

export const blockedPhones = sqliteTable("blocked_phones", {
  phone: text("phone").primaryKey(),
  at: text("at").notNull().default(now),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});

export const adSpend = sqliteTable(
  "ad_spend",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    month: text("month").notNull(),
    amount: integer("amount").notNull(),
  },
  (t) => [uniqueIndex("ad_spend_month").on(t.campaignId, t.month)],
);
