// Store settings, products, stock and orders survive a restart.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { act, createProduct, placeOrder, setRole, setUpStore, variantId } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  let owner = await (await runtime.context("owner")).newPage();
  await setUpStore(owner);
  await setRole(owner, "owner@example.test", "confirmer");
  await createProduct(owner, { name: "Woven Market Basket", price: 2600, cost: 1100, variants: [["Natural", 9]] });
  expect((await placeOrder(runtime, { variantId: await variantId(runtime, "Natural"), name: "Sofiane Belkacem", phone: "0662778899", wilaya: 31 })).status).toBe(201);
  const order = await (await runtime.database()).prepare("SELECT id FROM orders").first();
  await owner.goto(`/orders/${order.id}`);
  await owner.getByTestId("outcome-select").selectOption("no_answer");
  await act(owner, owner.getByTestId("outcome-save"));

  await runtime.restart();

  owner = await (await runtime.context("owner")).newPage();
  await owner.goto("/products");
  await expect(owner.getByTestId("product-row").filter({ hasText: "Woven Market Basket" })).toBeVisible();
  await owner.goto(`/orders/${order.id}`);
  await expect(owner.getByTestId("order-customer")).toContainText("Sofiane Belkacem");
  await expect(owner.getByTestId("timeline")).toContainText("No answer");
  await owner.goto("/settings");
  await expect(owner.getByTestId("store-name")).toHaveValue("Atlas Home Goods");
  await expect(owner.getByTestId("fee-home-31")).toHaveValue("600");
  const store = await (await runtime.fetch("/s")).text();
  expect(store).toContain("Atlas Home Goods");
  expect(store).toContain("Woven Market Basket");
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
