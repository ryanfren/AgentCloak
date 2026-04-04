import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EmailProvider } from "../../providers/types.js";

export function registerProviderInfo(
  server: McpServer,
  provider: EmailProvider,
) {
  server.tool(
    "get_provider_info",
    "Get information about the email provider type, supported search operators, and limitations. Call this to understand what queries and features are available.",
    {},
    async () => {
      const info = provider.getProviderInfo();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    },
  );
}
