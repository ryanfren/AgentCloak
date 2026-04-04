import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FilterPipeline } from "../../filters/pipeline.js";
import type { EmailProvider } from "../../providers/types.js";
import { formatAddress, formatAddresses } from "./format.js";

export function registerReadEmail(
  server: McpServer,
  provider: EmailProvider,
  pipeline: FilterPipeline,
) {
  server.tool(
    "read_email",
    "Read the full content of an email by message ID. Content is sanitized and filtered for safety.",
    {
      message_id: z.string().describe("The Gmail message ID to read"),
    },
    async ({ message_id }) => {
      const message = await provider.getMessage(message_id);
      const result = pipeline.process(message);

      if (result.action === "block") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "blocked",
                reason: result.reason,
                message_id,
              }),
            },
          ],
          isError: true,
        };
      }

      const m = result.message;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: m.id,
                threadId: m.threadId,
                subject: m.subject,
                from: formatAddress(m.from, pipeline),
                to: formatAddresses(m.to, pipeline),
                cc: formatAddresses(m.cc, pipeline),
                date: m.date,
                body: m.body,
                labels: m.labels,
                isUnread: m.isUnread,
                attachments: m.attachments,
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
