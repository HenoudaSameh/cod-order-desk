import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { getMe } from "@/serverFunctions/desk";

export const Route = createFileRoute("/_desk")({
  beforeLoad: async () => ({ me: await getMe() }),
  head: () => ({ meta: [{ title: "COD Order Desk" }] }),
  component: Desk,
});

type Me = Awaited<ReturnType<typeof getMe>>;

function links(me: Me) {
  const confirm = me.admin || me.role === "confirmer";
  const ship = me.admin || me.role === "shipper";
  return [
    { to: "/", label: "Orders", show: confirm || ship },
    { to: "/shipping", label: "Shipping", show: ship },
    { to: "/customers", label: "Customers", show: confirm },
    { to: "/products", label: "Products", show: me.admin },
    { to: "/profit", label: "Profit", show: me.admin },
    { to: "/campaigns", label: "Campaigns", show: me.admin },
    { to: "/team", label: "Team", show: me.admin },
    { to: "/settings", label: "Settings", show: me.admin },
  ].filter((l) => l.show);
}

function Desk() {
  const { me } = Route.useRouteContext();
  return (
    <AppShell
      nav={
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
          {links(me).map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/", includeSearch: false }}
              className="shrink-0 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "bg-muted text-foreground" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      }
    >
      <Outlet />
    </AppShell>
  );
}
