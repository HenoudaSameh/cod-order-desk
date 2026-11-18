import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "cod-order-desk",
  name: "COD Order Desk",
  description:
    "A cash-on-delivery store with an order desk: take orders, confirm them by phone, ship, track returns and see your profit.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
  },
  // Everything else needs a signed-in member.
  public: [
    // The store and its product pages, which customers open from ads.
    { path: "/s", methods: ["GET"] },
    { path: "/s/**", methods: ["GET"] },
    // The order form posts here; it checks the product, phone and province itself.
    { path: "/s/api/order", methods: ["POST"] },
    // The built scripts, styles and icon the store pages load.
    { path: "/assets/**", methods: ["GET"] },
    { path: "/icon.svg", methods: ["GET"] },
  ],
});
