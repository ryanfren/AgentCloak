import { Hono } from "hono";

export function createDashboardRoutes() {
  const routes = new Hono();

  routes.get("/dashboard", (c) => {
    return c.json({
      message: "Dashboard coming in Phase 5",
      pages: ["overview", "api-keys", "filters", "connected-accounts"],
    });
  });

  return routes;
}
