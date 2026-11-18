import { createRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { EmptyState } from "@/client/components/EmptyState";
import { routeTree } from "./routeTree.gen";

function RouteError({ error }: ErrorComponentProps) {
  return (
    <EmptyState
      kind="error"
      title="This page couldn't load"
      description={error instanceof Error ? error.message : undefined}
    />
  );
}

function NotFoundPage() {
  return <EmptyState kind="filtered" title="Page not found" />;
}

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFoundPage,
  });
}
