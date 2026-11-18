// Shared steps for the suites: each drives the real pages as a person would.
import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

export const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Clicks a button and waits for the server function it calls to answer. */
export async function act(page, locator) {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/_serverFn/") && r.request().method() === "POST"),
    locator.click(),
  ]);
}

/** Store name, two provinces with fees, one custom call status. */
export async function setUpStore(page) {
  await page.goto("/settings");
  await page.getByTestId("store-name").fill("Atlas Home Goods");
  for (const [code, home, office, ret] of [["16", "400", "250", "150"], ["31", "600", "400", "200"]]) {
    await page.getByTestId(`fee-home-${code}`).fill(home);
    await page.getByTestId(`fee-office-${code}`).fill(office);
    await page.getByTestId(`fee-return-${code}`).fill(ret);
  }
  await act(page, page.getByTestId("save-settings"));
  await expect(page.getByText("Settings saved")).toBeVisible();
}

/** A published product with two variants in stock; returns its page path. */
export async function createProduct(page, { name, price, cost, published = true, variants }) {
  await page.goto("/products");
  await page.getByTestId("new-product").click();
  await page.getByTestId("product-name").fill(name);
  await page.getByTestId("product-description").fill(`${name}, woven and finished by hand.`);
  await page.getByTestId("product-price").fill(String(price));
  await page.getByTestId("product-cost").fill(String(cost));
  if (!published) await page.getByTestId("product-published").click();
  await Promise.all([page.waitForURL(/\/products\/[^/]+$/), page.getByTestId("product-save").click()]);
  for (const [label, stock] of variants) {
    await page.getByTestId("variant-label").fill(label);
    await page.getByTestId("variant-stock").fill(String(stock));
    await act(page, page.getByTestId("add-variant"));
    await expect(page.getByTestId(`stock-${label}`)).toHaveText(String(stock));
  }
  return new URL(page.url()).pathname;
}

/** Owner sets a person's team role on the team page. */
export async function setRole(page, email, role) {
  await page.goto("/team");
  const row = page.getByTestId(`staff-${email}`);
  await row.getByTestId("role-select").selectOption(role);
  await act(page, row.getByTestId("role-save"));
  await expect(row.getByTestId("role-current")).toHaveText(role === "none" ? "No role" : role[0].toUpperCase() + role.slice(1));
}

export async function variantId(runtime, label) {
  const row = await (await runtime.database()).prepare("SELECT id FROM variants WHERE label = ?").bind(label).first();
  return row.id;
}

export function placeOrder(runtime, body) {
  return runtime.fetch("/s/api/order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commune: "Bab Ezzouar", address: "12 Rue des Oliviers", deliveryType: "home", quantity: 1, ...body }),
  });
}
