# COD Order Desk

A cash-on-delivery store and the back office behind it: customers order from a public product page, your team confirms each order by phone, ships it, tracks it to delivery or return, and sees what the month really earned.

Inspired by https://tassyir.io

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Keep products with prices, costs and variants, adjust stock with a reason, and see low stock at a glance.
- Take orders from a public store page with province-based delivery fees, blocked phones refused and repeat orders merged.
- Share new orders among confirmers in turn, call with the phone's history in view, and confirm, edit, postpone or cancel.
- Ship confirmed orders in bulk, print delivery slips, move parcels to delivered or returned, and spot parcels with no news for 4 days.
- See the month's money collected and net profit, per product, and each ad campaign's cost per delivered order.

Left out: accounts and sign-in, which your Gateway handles; courier API integrations; store themes and landing pages; ad pixels; order imports; mobile apps; billing and plans.

## Setup

- Install: `pnpm install`
- Run locally: `pnpm dev`, then open the printed address.
- Test: `pnpm types:check`; the suites in `checks/` run against a packaged release in EveryApp's local Gateway runtime.
- Deploy: `pnpm run deploy` to your EveryApp Gateway.

There are no secrets or settings. After the first deploy, an admin opens Settings to set the store name and delivery fees, then gives teammates the confirmer or shipper role under Team. The public store is at `/s` on the app's address; campaign links add `?c=CODE`.

## Limitations

- One store per install, priced in dinars.
- Couriers and tracking numbers are entered by hand; parcel statuses don't sync from couriers.
- Pending orders untouched for 2 hours move to the next confirmer on a 15-minute schedule.
- Teammates appear on the Team page only after they've opened the app once.
- Deploying to a live Gateway was not part of local testing.
