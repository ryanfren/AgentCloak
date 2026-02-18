import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { handleMcpRequest } from "./mcp/route.js";
import { createOAuthRoutes } from "./routes/oauth.js";
import { createDashboardRoutes } from "./routes/dashboard.js";
import { createStorage } from "./storage/index.js";
import { hashApiKey } from "./storage/sqlite.js";

type Env = {
  Variables: {
    userId: string;
    apiKeyId: string;
  };
  Bindings: {
    incoming: IncomingMessage;
    outgoing: ServerResponse;
  };
};

async function main() {
  const config = loadConfig();
  const storage = await createStorage(config);

  const app = new Hono<Env>();

  // Global middleware
  app.use("*", logger());
  app.use("*", cors());

  // Health check
  app.get("/health", (c) => {
    return c.json({ status: "ok", version: "0.1.0" });
  });

  // OAuth routes (no API key required)
  app.route("/auth", createOAuthRoutes(storage, config));

  // Dashboard (no API key required for now)
  app.route("/", createDashboardRoutes());

  // MCP route (GET/DELETE handled by Hono, POST bypasses Hono)
  app.get("/mcp", (c) =>
    c.json({ error: "SSE not supported in stateless mode. Use POST for MCP requests." }, 405),
  );
  app.delete("/mcp", (c) =>
    c.json({ error: "Session termination not supported in stateless mode." }, 405),
  );

  // Create HTTP server with MCP bypass for POST /mcp
  const honoListener = getRequestListener(app.fetch);

  const server = createServer(async (req, res) => {
    // Bypass Hono for POST /mcp — the MCP transport writes directly to the response
    if (req.method === "POST" && req.url === "/mcp") {
      // Handle CORS preflight headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      // Authenticate API key
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing or invalid Authorization header" }));
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
      await handleMcpRequest(req, res, storedKey.userId, storage, config);
      return;
    }

    // Handle CORS preflight for /mcp
    if (req.method === "OPTIONS" && req.url === "/mcp") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.writeHead(204);
      res.end();
      return;
    }

    // Everything else goes through Hono
    honoListener(req, res);
  });

  server.listen(config.port, () => {
    console.log(`AgentCloak server running on http://localhost:${config.port}`);
    console.log(`MCP endpoint: http://localhost:${config.port}/mcp`);
    console.log(`OAuth: http://localhost:${config.port}/auth/gmail?user_id=<id>`);
  });
}

main().catch(console.error);
