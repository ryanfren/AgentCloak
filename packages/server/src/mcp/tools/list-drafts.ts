import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EmailProvider } from "../../providers/types.js";

export function registerListDrafts(
  server: McpServer,
  provider: EmailProvider,
) {
  server.tool(
    "list_drafts",
    "List email drafts. Returns draft metadata including recipients and subjects.",
    {
      max_results: z.number().min(1).max(200).default(20).describe("Maximum number of drafts to return."),
    },
    async ({ max_results }) => {
      const result = await provider.listDrafts(max_results);

      const drafts = result.drafts.map((d) => ({
        id: d.id,
        messageId: d.messageId,
        to: d.to.map((a) => `${a.name} <${a.email}>`),
        subject: d.subject,
        snippet: d.snippet,
        updatedAt: d.updatedAt,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ drafts }, null, 2),
          },
        ],
      };
    },
  );
}
