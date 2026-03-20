import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";

import App from "@/App";
import NotFoundPage from "@/routes/not-found";

const rootRoute = createRootRoute({
  component: App,
  notFoundComponent: NotFoundPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("@/routes/dashboard-route")),
});

const recipientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recipients",
  component: lazyRouteComponent(() => import("@/routes/recipients-route")),
});

const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions",
  component: lazyRouteComponent(() => import("@/routes/transactions-route")),
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  recipientsRoute,
  transactionsRoute,
]);

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export { router };
