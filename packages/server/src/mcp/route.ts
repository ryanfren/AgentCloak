import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Config } from "../config.js";
import { FilterPipeline } from "../filters/pipeline.js";
import { GasProvider } from "../providers/gas/client.js";
import { GmailProvider } from "../providers/gmail/client.js";
import { ImapProvider } from "../providers/imap/client.js";
import type { EmailProvider } from "../providers/types.js";
import type { GasCredentials, ImapCredentials, OAuthTokens, Storage, StoredEmailConnection } from "../storage/types.js";
import { registerAllTools } from "./tools/index.js";

export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  connectionId: string,
  storage: Storage,
  config: Config,
): Promise<void> {
  // Load connection
  const connection = await storage.getConnection(connectionId);
  if (!connection) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Connection not found. Connect an email account first.",
      }),
    );
    return;
  }

  if (connection.status !== "active") {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `Connection is ${connection.status}. Reconnect your email account to continue.`,
      }),
    );
    return;
  }

  // Create per-request MCP server
  const mcpServer = new McpServer({
    name: "agentcloak",
    version: "0.1.0",
  });

  // Create provider and pipeline for this connection
  const provider = createProvider(connection, config, storage);
  const filterConfig = await storage.getFilterConfig(connectionId);
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

function createProvider(
  connection: StoredEmailConnection,
  config: Config,
  storage: Storage,
): EmailProvider {
  if (connection.provider === "gmail") {
    return new GmailProvider(
      config,
      connection.tokens as OAuthTokens,
      connection.id,
      storage,
    );
  }

  if (connection.provider === "gas") {
    return new GasProvider(connection.tokens as GasCredentials, config.sessionSecret);
  }

  if (connection.provider === "imap" || connection.provider.startsWith("imap:")) {
    return new ImapProvider(
      connection.tokens as ImapCredentials,
      config.sessionSecret,
    );
  }

  throw new Error(`Unknown provider: ${connection.provider}`);
}
