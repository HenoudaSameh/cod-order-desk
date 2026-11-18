// Who may see and change what: perimeter, public surface, roles, ownership, admin-only actions.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { act, createProduct, placeOrder, setRole, setUpStore, variantId } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  const db = await runtime.database();
  const html = async (path, role) => {
    const res = await runtime.fetch(path, { role });
    return { status: res.status, body: await res.text() };
  };

  // Members only, outside the public store.
  await runtime.assertPrivateAccess(["/", "/shipping", "/customers", "/health"]);
  for (const path of ["/products", "/profit", "/settings", "/team", "/campaigns", "/orders/1", "/orders/1/slip"]) {
    for (const role of [undefined, "outsider"]) {
      expect([401, 403]).toContain((await runtime.fetch(path, { role })).status);
    }
  }

  // No sign-in of the app's own (X001).
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/register", "/logout"]) {
    for (const role of [undefined, "member"]) {
      const { status, body } = await html(path, role);
      expect(status).not.toBe(200);
      expect(body).not.toContain('type="password"');
    }
  }

  const owner = await (await runtime.context("owner")).newPage();
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/");
  await expect(member.getByTestId("no-role")).toBeVisible();

  await setUpStore(owner);
  await createProduct(owner, { name: "Cedar Serving Board", price: 3200, cost: 1450, variants: [["Large", 20]] });
  await createProduct(owner, { name: "Hidden Prototype Lamp", price: 9900, cost: 6100, published: false, variants: [["One size", 2]] });
  const archivedPath = await createProduct(owner, { name: "Retired Clay Vase", price: 2800, cost: 900, variants: [["Tall", 4]] });
  await owner.goto(archivedPath);
  await act(owner, owner.getByTestId("archive-product"));

  // The public store shows published products and prices, nothing else.
  const store = await html("/s");
  expect(store.status).toBe(200);
  expect(store.body).toContain("Cedar Serving Board");
  for (const hidden of ["Hidden Prototype Lamp", "Retired Clay Vase", "1450", "1,450", "owner@example.test"]) expect(store.body).not.toContain(hidden);
  expect((await html("/s/p/hidden-prototype-lamp")).body).not.toContain("9,900");
  expect((await placeOrder(runtime, { variantId: await variantId(runtime, "One size"), name: "Lina Amrani", phone: "0555443322", wilaya: 16 })).status).toBe(404);
  expect((await placeOrder(runtime, { variantId: await variantId(runtime, "Tall"), name: "Lina Amrani", phone: "0555443322", wilaya: 16 })).status).toBe(404);
  // Price and fee come from the store, never the visitor.
  const large = await variantId(runtime, "Large");
  const placed = await placeOrder(runtime, { variantId: large, name: "Lina Amrani", phone: "0555443322", wilaya: 16, unitPrice: 1, deliveryFee: 0 });
  expect(placed.status).toBe(201);
  const placedBody = await placed.text();
  expect(placedBody).not.toContain("Lina Amrani");
  const first = await db.prepare("SELECT id, unit_price, delivery_fee FROM orders ORDER BY id LIMIT 1").first();
  expect([first.unit_price, first.delivery_fee]).toEqual([3200, 400]);

  // Without a role a member sees no orders, products, profit or settings.
  expect((await html(`/orders/${first.id}`, "member")).body).not.toContain("Lina Amrani");
  expect((await html("/?view=all", "member")).body).not.toContain("Lina Amrani");
  expect((await html("/customers", "member")).body).not.toContain("0555443322");
  for (const path of ["/products", "/profit", "/settings", "/team", "/campaigns"]) {
    const { body } = await html(path, "member");
    expect(body).not.toContain("Cedar Serving Board");
    expect(body).not.toContain("Atlas Home Goods");
    expect(body).toContain('data-testid="admin-only"');
  }

  // Confirmers see only the orders assigned to them.
  await setRole(owner, "owner@example.test", "confirmer");
  await setRole(owner, "member@example.test", "confirmer");
  for (const [name, phone] of [["Walid Mansouri", "0661000111"], ["Imane Cherif", "0661000222"], ["Rania Saadi", "0661000333"]]) {
    expect((await placeOrder(runtime, { variantId: large, name, phone, wilaya: 16 })).status).toBe(201);
  }
  const rows = (await db.prepare("SELECT id, assignee_id, customer_name FROM orders WHERE id > ? ORDER BY id").bind(first.id).all()).results;
  const ownersOrder = rows.find((r) => r.assignee_id === "owner");
  const membersOrder = rows.find((r) => r.assignee_id === "member");
  expect(ownersOrder && membersOrder).toBeTruthy();
  expect((await html(`/orders/${membersOrder.id}`, "member")).body).toContain(membersOrder.customer_name);
  expect((await html(`/orders/${ownersOrder.id}`, "member")).body).not.toContain(ownersOrder.customer_name);
  expect((await html(`/orders/${ownersOrder.id}/slip`, "member")).body).not.toContain(ownersOrder.customer_name);
  expect((await html("/?view=all", "member")).body).not.toContain(ownersOrder.customer_name);
  expect((await html("/customers", "member")).body).not.toContain(ownersOrder.customer_name);
  expect((await html(`/orders/${ownersOrder.id}`, "owner")).body).toContain(ownersOrder.customer_name);

  // Captures the server-function request an action makes, to replay it as someone else.
  async function capture(page, run) {
    let captured;
    const listener = (request) => {
      if (request.url().includes("/_serverFn/") && request.method() === "POST" && !captured) captured = { url: new URL(request.url()).pathname + new URL(request.url()).search, body: request.postData(), headers: request.headers() };
    };
    page.on("request", listener);
    await run();
    page.off("request", listener);
    return captured;
  }
  const replay = (call, role) => runtime.fetch(call.url, { role, method: "POST", body: call.body, headers: { "content-type": call.headers["content-type"] ?? "application/json", accept: call.headers["accept"] ?? "*/*", ...(call.headers["x-tsr-serverfn"] ? { "x-tsr-serverfn": call.headers["x-tsr-serverfn"] } : {}) } });

  // A member changing another's order: the owner's confirm call replayed by the member on the owner's order.
  await member.goto(`/orders/${membersOrder.id}`);
  const memberConfirm = await capture(member, () => act(member, member.getByTestId("confirm-order")));
  const forged = { ...memberConfirm, body: memberConfirm.body.replaceAll(String(membersOrder.id), String(ownersOrder.id)) };
  await replay(forged, "member");
  expect((await db.prepare("SELECT status FROM orders WHERE id = ?").bind(ownersOrder.id).first()).status).toBe("pending");

  // Admin-only actions refuse a non-admin, replayed from the owner's own requests.
  await owner.goto("/customers");
  const block = await capture(owner, () => act(owner, owner.getByTestId("block-0661000111")));
  await act(owner, owner.getByTestId("unblock-0661000111"));
  await replay(block, "member");
  expect(await db.prepare("SELECT phone FROM blocked_phones WHERE phone = '0661000111'").first()).toBeNull();

  await owner.goto("/team");
  const roleRow = owner.getByTestId("staff-owner@example.test");
  await roleRow.getByTestId("role-select").selectOption("shipper");
  const roleCall = await capture(owner, () => act(owner, roleRow.getByTestId("role-save")));
  await setRole(owner, "owner@example.test", "confirmer");
  const promote = { ...roleCall, body: roleCall.body.replaceAll("owner", "member") };
  await replay(promote, "member");
  expect((await db.prepare("SELECT role FROM staff WHERE user_id = 'member'").first()).role).toBe("confirmer");

  const stockBefore = (await db.prepare("SELECT stock FROM variants WHERE id = ?").bind(large).first()).stock;
  await owner.goto((await db.prepare("SELECT product_id FROM variants WHERE id = ?").bind(large).first()).product_id.replace(/^/, "/products/"));
  await owner.getByTestId("adjust-Large").click();
  await owner.getByTestId("adjust-delta").fill("1");
  await owner.getByTestId("adjust-reason").fill("Counted again");
  const adjust = await capture(owner, () => act(owner, owner.getByTestId("adjust-save")));
  await replay(adjust, "member");
  expect((await db.prepare("SELECT stock FROM variants WHERE id = ?").bind(large).first()).stock).toBe(stockBefore + 1);

  // Shippers never see pending orders.
  await setRole(owner, "member@example.test", "shipper");
  expect((await html(`/orders/${ownersOrder.id}`, "member")).body).not.toContain(ownersOrder.customer_name);
  expect((await html("/shipping", "member")).body).not.toContain(ownersOrder.customer_name);
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
