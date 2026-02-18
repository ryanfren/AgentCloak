import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FilterPipeline } from "../../filters/pipeline.js";
import type { EmailProvider } from "../../providers/types.js";
import { formatAddress, formatAddresses } from "./format.js";

export function registerGetThread(
  server: McpServer,
  provider: EmailProvider,
  pipeline: FilterPipeline,
) {
  server.tool(
    "get_thread",
    "Get all messages in an email thread. Each message is sanitized through the content filter pipeline.",
    {
      thread_id: z.string().describe("The Gmail thread ID to retrieve"),
    },
    async ({ thread_id }) => {
      const { thread, messages } = await provider.getThread(thread_id);
      const { passed, blocked } = pipeline.processBatch(messages);

      const sanitizedMessages = passed.map((m) => ({
        id: m.id,
        from: formatAddress(m.from, pipeline),
        to: formatAddresses(m.to, pipeline),
        cc: formatAddresses(m.cc, pipeline),
        date: m.date,
        body: m.body,
        attachments: m.attachments,
      }));

      const response: Record<string, unknown> = {
        threadId: thread.id,
        subject: thread.subject,
        participants: formatAddresses(thread.participants, pipeline),
        messageCount: thread.messageCount,
        messages: sanitizedMessages,
      };
      if (pipeline.showFilteredCount) {
        response.filteredCount = blocked.length;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );
}
