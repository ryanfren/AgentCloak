import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { handleMcpRequest } from "./mcp/route.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createOAuthRoutes } from "./routes/oauth.js";
import { createApiRoutes } from "./routes/api.js";
import { createStorage } from "./storage/index.js";
import { hashApiKey } from "./storage/sqlite.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = loadConfig();
  const storage = await createStorage(config);

  // Clean up expired sessions on startup
  await storage.deleteExpiredSessions();
  // Periodic cleanup every hour
  setInterval(
    () => storage.deleteExpiredSessions().catch(console.error),
    60 * 60 * 1000,
  );

  const app = new Hono();

  // Global middleware
  app.use("*", logger());
  // Dashboard routes need credentials (cookies) — restrict origin
  app.use("/api/*", cors({ origin: config.baseUrl, credentials: true }));
  app.use("/auth/*", cors({ origin: config.baseUrl, credentials: true }));
  // Everything else (health, etc) uses permissive CORS
  app.use("*", cors());

  // Health check
  app.get("/health", (c) => {
    return c.json({ status: "ok", version: "0.1.0" });
  });

  // Auth routes (email/password register + login, config)
  app.route("/auth", createAuthRoutes(storage, config));

  // OAuth routes (Google login + connect)
  app.route("/auth", createOAuthRoutes(storage, config));

  // Dashboard API routes (session auth)
  app.route("/api", createApiRoutes(storage, config));

  // MCP route (GET/DELETE handled by Hono, POST bypasses Hono)
  app.get("/mcp", (c) =>
    c.json(
      {
        error:
          "SSE not supported in stateless mode. Use POST for MCP requests.",
      },
      405,
    ),
  );
  app.delete("/mcp", (c) =>
    c.json(
      { error: "Session termination not supported in stateless mode." },
      405,
    ),
  );

  // Static asset serving for React SPA
  const webDistPath = resolve(__dirname, "../../web/dist");
  const hasWebDist = existsSync(webDistPath);

  if (hasWebDist) {
    // Serve hashed assets (JS, CSS, images)
    app.use(
      "/assets/*",
      serveStatic({ root: webDistPath, rewriteRequestPath: (p) => p }),
    );

    // SPA catch-all — return index.html for client-side routing
    // Must be registered LAST, after all API routes
    app.get("*", async (c) => {
      const indexPath = resolve(webDistPath, "index.html");
      if (existsSync(indexPath)) {
        const { readFile } = await import("node:fs/promises");
        const html = await readFile(indexPath, "utf-8");
        return c.html(html);
      }
      return c.json({ error: "Dashboard not built" }, 404);
    });
  }

  // Create HTTP server with MCP bypass for POST /mcp
  const honoListener = getRequestListener(app.fetch);

  const server = createServer(async (req, res) => {
    // Bypass Hono for POST /mcp — the MCP transport writes directly to the response
    if (req.method === "POST" && req.url === "/mcp") {
      // Handle CORS preflight headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );

      // Authenticate API key
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Missing or invalid Authorization header",
          }),
        );
        return;
      }

      const apiKey = authHeader.slice(7);
      if (!apiKey.startsWith("ac_")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid API key format" }));
        return;
      }
      const keyHash = hashApiKey(apiKey);
      const storedKey = await storage.getApiKeyByHash(keyHash);
      if (!storedKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid API key" }));
        return;
      }

      await storage.updateApiKeyLastUsed(storedKey.id);

      // Ensure Accept header includes text/event-stream for MCP transport compatibility.
      // Some clients (e.g., Claude Code) only send Accept: application/json.
      // Hono's node-server reads from rawHeaders, so we must patch both.
      const accept = req.headers.accept ?? "";
      if (!accept.includes("text/event-stream")) {
        const patched = accept
          ? `${accept}, text/event-stream`
          : "application/json, text/event-stream";
        req.headers.accept = patched;
        const idx = req.rawHeaders.findIndex(
          (h) => h.toLowerCase() === "accept",
        );
        if (idx !== -1) {
          req.rawHeaders[idx + 1] = patched;
        } else {
          req.rawHeaders.push("Accept", patched);
        }
      }

      try {
        await handleMcpRequest(
          req,
          res,
          storedKey.connectionId,
          storage,
          config,
        );
      } catch (err) {
        console.error("MCP request failed:", err);
        if (!res.headersSent) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid request" }));
        }
      }
      return;
    }

    // Handle CORS preflight for /mcp
    if (req.method === "OPTIONS" && req.url === "/mcp") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      res.writeHead(204);
      res.end();
      return;
    }

    // Everything else goes through Hono
    honoListener(req, res);
  });

  server.listen(config.port, () => {
    console.log(
      `AgentCloak server running on http://localhost:${config.port}`,
    );
    console.log(`MCP endpoint: http://localhost:${config.port}/mcp`);
    console.log(`Dashboard: http://localhost:${config.port}`);
    if (hasWebDist) {
      console.log("Dashboard UI: serving from packages/web/dist");
    } else {
      console.log(
        "Dashboard UI: not built (run pnpm build:web to enable)",
      );
    }
  });
}

main().catch(console.error);
