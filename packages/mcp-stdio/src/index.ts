#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { randomUUID } from "node:crypto";

const CONFIG_FILE = join(homedir(), ".agentcloak", "config.json");

interface AgentCloakConfig {
  serverUrl: string;
  apiKey: string;
}

function loadConfig(): AgentCloakConfig {
  const serverUrl =
    process.env.AGENTCLOAK_URL ??
    (existsSync(CONFIG_FILE)
      ? JSON.parse(readFileSync(CONFIG_FILE, "utf-8")).serverUrl
      : "http://localhost:3000");

  const apiKey =
    process.env.AGENTCLOAK_API_KEY ??
    (existsSync(CONFIG_FILE)
      ? JSON.parse(readFileSync(CONFIG_FILE, "utf-8")).apiKey
      : undefined);

  if (!apiKey) {
    console.error(
      "API key required. Set AGENTCLOAK_API_KEY or run 'agentcloak setup'.",
    );
    process.exit(1);
  }

  return { serverUrl, apiKey };
}

async function mcpRequest(
  config: AgentCloakConfig,
  method: string,
  params: unknown,
): Promise<unknown> {
  const body = {
    jsonrpc: "2.0",
    id: randomUUID(),
    method,
    params,
  };

  const res = await fetch(`${config.serverUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`MCP request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (data.error) {
    throw new Error(`MCP error: ${data.error.message}`);
  }

  return data.result;
}

async function main() {
  const config = loadConfig();

  // First, discover tools from the remote server
  const toolsResult = (await mcpRequest(config, "tools/list", {})) as {
    tools: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
  };

  const server = new McpServer({
    name: "agentcloak-stdio-proxy",
    version: "0.1.0",
  });

  // Register each remote tool as a local proxy
  for (const remoteTool of toolsResult.tools) {
    // Build a zod schema from the JSON schema properties
    const properties = (remoteTool.inputSchema as Record<string, unknown>)
      .properties as Record<string, { type: string; description?: string }> | undefined;
    const required = (remoteTool.inputSchema as Record<string, unknown>)
      .required as string[] | undefined;

    const zodShape: Record<string, z.ZodTypeAny> = {};
    if (properties) {
      for (const [key, prop] of Object.entries(properties)) {
        let field: z.ZodTypeAny;
        switch (prop.type) {
          case "number":
          case "integer":
            field = z.number();
            break;
          case "boolean":
            field = z.boolean();
            break;
          case "array":
            field = z.array(z.any());
            break;
          default:
            field = z.string();
        }
        if (prop.description) {
          field = field.describe(prop.description);
        }
        if (!required?.includes(key)) {
          field = field.optional();
        }
        zodShape[key] = field;
      }
    }

    server.tool(
      remoteTool.name,
      remoteTool.description,
      zodShape,
      async (args) => {
        const result = (await mcpRequest(config, "tools/call", {
          name: remoteTool.name,
          arguments: args,
        })) as { content: Array<{ type: "text"; text: string }> };

        return result;
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
