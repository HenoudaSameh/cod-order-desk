// Every retained feature's main path, driven through the pages and the public order route.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { act, createProduct, placeOrder, setRole, setUpStore, thisMonth, variantId } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  const db = await runtime.database();
  const orders = async () => (await db.prepare("SELECT id, assignee_id, quantity, status, campaign_code FROM orders ORDER BY id").all()).results;

  // The member opens the app once, so the team page knows them.
  expect((await runtime.fetch("/", { role: "member" })).status).toBe(200);
  const owner = await (await runtime.context("owner")).newPage();

  // F002 settings, F003 roles.
  await setUpStore(owner);
  await owner.getByTestId("call-status-input").fill("Wrong number");
  await act(owner, owner.getByTestId("add-call-status"));
  await expect(owner.getByTestId("call-statuses")).toContainText("Wrong number");
  await setRole(owner, "owner@example.test", "confirmer");
  await setRole(owner, "member@example.test", "confirmer");

  // F001: product, variants, a hand adjustment with its reason, low stock in the list.
  const productPath = await createProduct(owner, { name: "Linen Throw Blanket", price: 4500, cost: 2100, variants: [["Sand", 12], ["Olive", 3]] });
  await owner.getByTestId("adjust-Sand").click();
  await owner.getByTestId("adjust-delta").fill("5");
  await owner.getByTestId("adjust-reason").fill("Restock from the workshop");
  await act(owner, owner.getByTestId("adjust-save"));
  await expect(owner.getByTestId("stock-Sand")).toHaveText("17");
  await expect(owner.getByTestId("stock-moves")).toContainText("Restock from the workshop");
  await owner.goto("/products");
  const productRow = owner.getByTestId("product-row").filter({ hasText: "Linen Throw Blanket" });
  await expect(productRow.getByTestId("low-stock")).toBeVisible();

  // F005: campaigns exist before their links are shared.
  await owner.goto("/campaigns");
  for (const [code, name] of [["SPRING", "Spring video ad"], ["AUTUMN", "Autumn carousel"]]) {
    await owner.getByTestId("new-campaign").click();
    await owner.getByTestId("campaign-code").fill(code);
    await owner.getByTestId("campaign-name").fill(name);
    await act(owner, owner.getByTestId("campaign-save"));
    await expect(owner.getByTestId(`campaign-${code}`)).toBeVisible();
  }
  await expect(owner.getByTestId("campaign-SPRING")).toContainText(`${runtime.hostname}/s?c=SPRING`);

  // F002: the public store and its order form.
  const visitor = await (await runtime.context(null)).newPage();
  await visitor.goto("/s");
  await expect(visitor.getByRole("heading", { name: "Atlas Home Goods" })).toBeVisible();
  await expect(visitor.getByText("Linen Throw Blanket", { exact: true })).toBeVisible();
  await visitor.goto("/s/p/linen-throw-blanket?c=SPRING");
  await expect(visitor.locator('[data-testid="order-wilaya"] option[value="1"]')).toBeDisabled();
  await visitor.getByTestId("order-name").fill("Yasmine Benali");
  await visitor.getByTestId("order-phone").fill("0550 12 34 56");
  await visitor.getByTestId("order-variant").selectOption({ label: "Sand" });
  await visitor.getByTestId("order-wilaya").selectOption("16");
  await visitor.getByTestId("order-delivery").selectOption("office");
  await expect(visitor.getByTestId("order-fee")).toHaveText("250 DA");
  await visitor.getByTestId("order-delivery").selectOption("home");
  await expect(visitor.getByTestId("order-fee")).toHaveText("400 DA");
  await expect(visitor.getByTestId("order-total")).toHaveText("4,900 DA");
  await visitor.getByTestId("order-commune").fill("Bab Ezzouar");
  await visitor.getByTestId("order-address").fill("Cité 1200 Logements, bloc 14");
  await Promise.all([visitor.waitForResponse((r) => r.url().endsWith("/s/api/order")), visitor.getByTestId("order-submit").click()]);
  await expect(visitor.getByTestId("order-thanks")).toBeVisible();

  // Request-level: other orders, a merge, a province without a fee.
  const olive = await variantId(runtime, "Olive");
  const b = await placeOrder(runtime, { variantId: olive, name: "Karim Haddad", phone: "0661234567", wilaya: 31, commune: "Bir El Djir", address: "5 Boulevard Front de Mer" });
  expect(b.status).toBe(201);
  const merged = await placeOrder(runtime, { variantId: olive, name: "Karim Haddad", phone: "0661 23 45 67", wilaya: 31, commune: "Bir El Djir", address: "5 Boulevard Front de Mer" });
  expect(merged.status).toBe(200);
  expect((await merged.json()).merged).toBe(true);
  const c = await placeOrder(runtime, { variantId: olive, name: "Samir Ouali", phone: "0770998877", wilaya: 16, deliveryType: "office", quantity: 5 });
  expect(c.status).toBe(201);
  expect((await placeOrder(runtime, { variantId: olive, name: "Nadia Ferhat", phone: "0551112233", wilaya: 1 })).status).toBe(400);

  let rows = await orders();
  expect(rows.length).toBe(3);
  const [A, B, C] = rows;
  expect(A.campaign_code).toBe("SPRING");
  expect(B.quantity).toBe(2);
  expect(new Set([A.assignee_id, B.assignee_id])).toEqual(new Set(["owner", "member"]));
  const mine = A.assignee_id === "member" ? A : B;
  const theirs = mine === A ? B : A;

  // The new order is on the owner's list at once.
  await owner.goto("/?view=all");
  await expect(owner.getByTestId(`order-row-${A.id}`)).toContainText("Yasmine Benali");

  // F003: an untouched pending order passes to the next confirmer.
  await db.prepare("UPDATE orders SET touched_at = ? WHERE id = ?").bind(new Date(Date.now() - 3 * 3600_000).toISOString(), C.id).run();
  await runtime.scheduled("*/15 * * * *");
  const handed = (await orders()).find((o) => o.id === C.id);
  expect(handed.assignee_id).not.toBe(C.assignee_id);

  // F003: the member calls their order: history, outcomes, a call back, confirmation.
  const member = await (await runtime.context("member")).newPage();
  await member.goto(`/orders/${mine.id}`);
  await expect(member.getByTestId("history-orders")).toHaveText("1");
  await expect(member.getByTestId("history-delivered")).toHaveText("0");
  await member.getByTestId("outcome-select").selectOption("no_answer");
  await act(member, member.getByTestId("outcome-save"));
  await expect(member.getByTestId("timeline")).toContainText("No answer");
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  await member.getByTestId("outcome-select").selectOption("callback");
  await member.getByTestId("callback-date").fill(tomorrow);
  await act(member, member.getByTestId("outcome-save"));
  await member.goto("/");
  await expect(member.getByTestId(`order-row-${mine.id}`)).toHaveCount(0);
  await member.goto("/?view=later");
  await expect(member.getByTestId(`order-row-${mine.id}`)).toBeVisible();
  await member.goto(`/orders/${mine.id}`);
  await act(member, member.getByTestId("confirm-order"));
  await expect(member.getByTestId("order-status")).toHaveText("Confirmed");

  // The owner: an admin-defined outcome, an edit, confirmation.
  await owner.goto(`/orders/${theirs.id}`);
  await owner.getByTestId("outcome-select").selectOption({ label: "Wrong number" });
  await act(owner, owner.getByTestId("outcome-save"));
  await expect(owner.getByTestId("timeline")).toContainText("Wrong number");
  await owner.getByTestId("edit-order").click();
  await owner.getByTestId("edit-address").fill("7 Rue Larbi Ben M'hidi, 2e étage");
  await act(owner, owner.getByTestId("edit-save"));
  await expect(owner.getByTestId("order-address")).toContainText("Larbi Ben M'hidi");
  await expect(owner.getByTestId("timeline")).toContainText("Edited");
  await act(owner, owner.getByTestId("confirm-order"));
  await expect(owner.getByTestId("order-status")).toHaveText("Confirmed");

  // Not enough stock is flagged; an admin reassigns, then cancels.
  await owner.goto(`/orders/${C.id}`);
  await expect(owner.getByTestId("stock-warning")).toBeVisible();
  await owner.getByTestId("reassign-select").selectOption({ label: "member@example.test" });
  await act(owner, owner.getByTestId("reassign-save"));
  await expect(owner.getByTestId("timeline")).toContainText("Reassigned");
  await owner.getByTestId("cancel-order").click();
  await act(owner, owner.getByTestId("cancel-confirm"));
  await expect(owner.getByTestId("order-status")).toHaveText("Cancelled");

  // Customers: grouped by phone; blocking refuses new orders.
  await owner.goto("/customers");
  await expect(owner.getByTestId("customer-0661234567").getByTestId("customer-orders")).toHaveText("1");
  await act(owner, owner.getByTestId("block-0770998877"));
  await expect(owner.getByTestId("blocked-0770998877")).toBeVisible();
  expect((await placeOrder(runtime, { variantId: olive, name: "Samir Ouali", phone: "0770998877", wilaya: 16 })).status).toBe(403);

  // F004: the member becomes a shipper and ships both confirmed orders.
  await setRole(owner, "member@example.test", "shipper");
  await member.goto("/shipping");
  await member.getByTestId(`select-${A.id}`).click();
  await member.getByTestId(`select-${B.id}`).click();
  await member.getByTestId("ship-selected").click();
  await member.getByTestId("ship-carrier").fill("Express Courier DZ");
  await member.getByTestId(`ship-tracking-${A.id}`).fill("EC-55120-AL");
  await member.getByTestId(`ship-tracking-${B.id}`).fill("EC-55121-OR");
  await act(member, member.getByTestId("ship-save"));
  await expect(member.getByTestId(`ready-${A.id}`)).toHaveCount(0);
  await owner.goto(productPath);
  await expect(owner.getByTestId("stock-Sand")).toHaveText("16");
  await expect(owner.getByTestId("stock-Olive")).toHaveText("1");

  // The slip.
  await member.goto(`/orders/${A.id}/slip`);
  await expect(member.getByTestId("slip")).toContainText("Yasmine Benali");
  await expect(member.getByTestId("slip")).toContainText("Cité 1200 Logements, bloc 14");
  await expect(member.getByTestId("slip-amount")).toHaveText("4,900 DA");

  // Stale parcels, then statuses through to delivered and returned.
  await db.prepare("UPDATE orders SET status_changed_at = ? WHERE id = ?").bind(new Date(Date.now() - 5 * 86400_000).toISOString(), A.id).run();
  await member.goto("/shipping?tab=parcels");
  await expect(member.getByTestId(`stale-${A.id}`)).toBeVisible();
  await expect(member.getByTestId(`stale-${B.id}`)).toHaveCount(0);
  for (const status of ["in_transit", "out_for_delivery", "delivered"]) {
    await member.getByTestId(`status-${A.id}`).selectOption(status);
    await act(member, member.getByTestId(`status-save-${A.id}`));
  }
  await expect(member.getByTestId(`stale-${A.id}`)).toHaveCount(0);
  await member.getByTestId(`status-${B.id}`).selectOption("returned");
  await act(member, member.getByTestId(`status-save-${B.id}`));
  await member.getByTestId("parcel-status-filter").selectOption("delivered");
  await expect(member.getByTestId(`parcel-${A.id}`)).toBeVisible();
  await expect(member.getByTestId(`parcel-${B.id}`)).toHaveCount(0);
  await owner.goto(productPath);
  await expect(owner.getByTestId("stock-Olive")).toHaveText("3");
  await expect(owner.getByTestId("stock-moves")).toContainText(`Order ${B.id} returned`);

  // F005: spend, cost per delivered order, the best campaign, the month's profit.
  await owner.goto("/campaigns");
  for (const [code, spend] of [["SPRING", "1200"], ["AUTUMN", "300"]]) {
    await owner.getByTestId(`spend-${code}`).fill(spend);
    await act(owner, owner.getByTestId(`spend-save-${code}`));
  }
  await expect(owner.getByTestId("delivered-SPRING")).toHaveText("1");
  await expect(owner.getByTestId("cpd-SPRING")).toHaveText("1,200 DA");
  await expect(owner.getByTestId("campaign-SPRING").getByTestId("best-campaign")).toBeVisible();
  await owner.goto(`/profit?month=${thisMonth()}`);
  await expect(owner.getByTestId("profit-collected")).toHaveText("4,900 DA");
  await expect(owner.getByTestId("profit-product-cost")).toHaveText("2,100 DA");
  await expect(owner.getByTestId("profit-delivery")).toHaveText("400 DA");
  await expect(owner.getByTestId("profit-returns")).toHaveText("200 DA");
  await expect(owner.getByTestId("profit-ads")).toHaveText("1,500 DA");
  await expect(owner.getByTestId("profit-net")).toHaveText("700 DA");
  await expect(owner.getByTestId("profit-product").filter({ hasText: "Linen Throw Blanket" })).toContainText("4,900 DA");

  // The orders desk with real work on it.
  await owner.goto("/?view=all");
  await expect(owner.getByTestId(`order-row-${A.id}`)).toContainText("Delivered");
  await runtime.assertBackLink(owner);
  await runtime.screenshot(owner);

  // Phone-sized smoke: the store's order form on a phone.
  const phone = await (await runtime.context(null, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/s/p/linen-throw-blanket");
  await expect(phone.getByTestId("order-submit")).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
