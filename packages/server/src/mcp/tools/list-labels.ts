import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FilterPipeline } from "../../filters/pipeline.js";
import type { EmailProvider } from "../../providers/types.js";

export function registerListLabels(
  server: McpServer,
  provider: EmailProvider,
  pipeline: FilterPipeline,
) {
  server.tool(
    "list_labels",
    "List all Gmail labels with unread message counts.",
    {},
    async () => {
      let labels = await provider.listLabels();

      // Filter labels to only allowed folders if configured
      if (pipeline.allowedFolders.length > 0) {
        const allowed = pipeline.allowedFolders.map((f) => f.toLowerCase());
        labels = labels.filter((l) =>
          allowed.includes(l.name.toLowerCase()),
        );
      }

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
