import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FilterPipeline } from "../../filters/pipeline.js";
import type { EmailProvider } from "../../providers/types.js";
import { formatAddress } from "./format.js";

export function registerSearchEmails(
  server: McpServer,
  provider: EmailProvider,
  pipeline: FilterPipeline,
) {
  server.tool(
    "search_emails",
    "Search emails by query. Returns sanitized email summaries with sensitive content filtered. For broad queries (e.g., all emails from today, weekly summaries, or audit tasks), use a high max_results (100-200) and follow up with nextPageToken to paginate through all results. Some emails may be filtered by security rules and not returned.",
    {
      query: z.string().describe("Gmail search query (e.g., 'from:user@example.com', 'subject:meeting', 'is:unread')"),
      max_results: z.number().min(1).max(200).default(20).describe("Maximum number of results to return. Use higher values (100-200) for broad searches like daily summaries or audits."),
      page_token: z.string().optional().describe("Pagination token from previous search. Use this to retrieve additional pages of results when nextPageToken is returned."),
    },
    async ({ query, max_results, page_token }) => {
      const result = await provider.search({
        query,
        maxResults: max_results,
        pageToken: page_token,
      });

      const { passed, blocked } = pipeline.processBatch(result.messages);

      const summaries = passed.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        subject: m.subject,
        from: formatAddress(m.from, pipeline),
        date: m.date,
        snippet: m.snippet,
        isUnread: m.isUnread,
        labels: m.labels,
        hasAttachments: m.attachments.length > 0,
      }));

      const response: Record<string, unknown> = {
        results: summaries,
        totalResults: result.resultSizeEstimate,
        nextPageToken: result.nextPageToken,
      };
      if (pipeline.showFilteredCount && blocked.length > 0) {
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
