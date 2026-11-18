import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { reassignUntouched } from "./server/assign";
import { tools } from "./tools";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401), and serves the tools. The
// cron hands untouched pending orders to the next confirmer.
export default {
  ...everyApp<Env>(async (request) => tanstackEntry.fetch(request), { tools }),
  async scheduled(
    _controller: ScheduledController,
    _env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(reassignUntouched());
  },
};
