import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EmailProvider } from "../../providers/types.js";

export function registerListLabels(
  server: McpServer,
  provider: EmailProvider,
) {
  server.tool(
    "list_labels",
    "List all Gmail labels with unread message counts.",
    {},
    async () => {
      const labels = await provider.listLabels();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                labels: labels.map((l) => ({
                  id: l.id,
                  name: l.name,
                  type: l.type,
                  messagesTotal: l.messagesTotal,
                  messagesUnread: l.messagesUnread,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
