import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Config } from "../config.js";
import { FilterPipeline } from "../filters/pipeline.js";
import { GmailProvider } from "../providers/gmail/client.js";
import type { Storage } from "../storage/types.js";
import { registerAllTools } from "./tools/index.js";

export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  storage: Storage,
  config: Config,
): Promise<void> {
  // Load user
  const user = await storage.getUser(userId);
  if (!user) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "User not found. Connect Gmail first." }));
    return;
  }

  // Create per-request MCP server
  const mcpServer = new McpServer({
    name: "agentcloak",
    version: "0.1.0",
  });

  // Create provider and pipeline for this user
  const provider = new GmailProvider(config, user.tokens, userId, storage);
  const filterConfig = await storage.getFilterConfig(userId);
  const pipeline = new FilterPipeline(filterConfig);

  // Register tools
  registerAllTools(mcpServer, provider, pipeline);

  // Create stateless transport
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await mcpServer.connect(transport);

  // Parse body from the raw request
  const body = await new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });

  // Handle the MCP request — transport writes directly to res
  await transport.handleRequest(req, res, body);
}
