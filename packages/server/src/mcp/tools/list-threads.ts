import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FilterPipeline } from "../../filters/pipeline.js";
import type { EmailProvider } from "../../providers/types.js";
import type { EmailThread } from "../../providers/types.js";
import { formatAddresses } from "./format.js";

function isThreadBlocked(thread: EmailThread, pipeline: FilterPipeline): boolean {
  // Check if all participants are from blocked domains
  // A thread is blocked only if every participant domain is blocked
  // (mixed threads with non-blocked participants are kept)
  const blockedDomains = pipeline.blockedDomains;
  if (blockedDomains.length === 0) return false;

  const allBlocked = thread.participants.length > 0 && thread.participants.every((p) => {
    const domain = p.email.toLowerCase().split("@")[1] ?? "";
    return blockedDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
  });

  return allBlocked;
}

export function registerListThreads(
  server: McpServer,
  provider: EmailProvider,
  pipeline: FilterPipeline,
) {
  server.tool(
    "list_threads",
    "List email threads matching a query. Returns thread summaries with participant lists. For broad queries, use a high max_results (100-200) and paginate with nextPageToken for complete results.",
    {
      query: z.string().default("").describe("Gmail search query to filter threads"),
      max_results: z.number().min(1).max(200).default(20).describe("Maximum number of threads to return. Use higher values (100-200) for broad searches."),
      page_token: z.string().optional().describe("Pagination token from previous request. Use this to retrieve additional pages of results."),
    },
    async ({ query, max_results, page_token }) => {
      const result = await provider.listThreads({
        query,
        maxResults: max_results,
        pageToken: page_token,
      });

      let blockedCount = 0;
      const summaries = result.threads
        .filter((t) => {
          if (isThreadBlocked(t, pipeline)) {
            blockedCount++;
            return false;
          }
          return true;
        })
        .map((t) => ({
          id: t.id,
          subject: t.subject,
          participants: formatAddresses(t.participants, pipeline),
          messageCount: t.messageCount,
          snippet: t.snippet,
          lastMessageDate: t.lastMessageDate,
          isUnread: t.isUnread,
          labels: t.labels,
        }));

      const response: Record<string, unknown> = {
        threads: summaries,
        totalResults: result.resultSizeEstimate,
        nextPageToken: result.nextPageToken,
      };
      if (pipeline.showFilteredCount && blockedCount > 0) {
        response.filteredCount = blockedCount;
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
