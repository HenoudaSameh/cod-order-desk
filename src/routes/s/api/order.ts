import { createFileRoute } from "@tanstack/react-router";
import { OrderRefused, placeOrder, placeOrderInput } from "@/server/store";

// Public (everyapp.config.ts): the store's order form posts here. Everything
// is checked on the server: the product is on sale, the phone isn't blocked,
// the province has a fee; price and fee come from the store.
export const Route = createFileRoute("/s/api/order")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const body: unknown = await request.json().catch(() => null);
        const parsed = placeOrderInput.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? "Check the form." },
            { status: 400 },
          );
        }
        try {
          const { merged } = await placeOrder(parsed.data);
          return Response.json(
            { ok: true, merged },
            { status: merged ? 200 : 201 },
          );
        } catch (error) {
          if (error instanceof OrderRefused)
            return Response.json(
              { error: error.message },
              { status: error.status },
            );
          throw error;
        }
      },
    },
  },
});
