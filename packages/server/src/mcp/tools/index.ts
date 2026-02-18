import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FilterPipeline } from "../../filters/pipeline.js";
import type { EmailProvider } from "../../providers/types.js";
import { registerCreateDraft } from "./create-draft.js";
import { registerGetThread } from "./get-thread.js";
import { registerListDrafts } from "./list-drafts.js";
import { registerListLabels } from "./list-labels.js";
import { registerListThreads } from "./list-threads.js";
import { registerReadEmail } from "./read-email.js";
import { registerProviderInfo } from "./provider-info.js";
import { registerSearchEmails } from "./search-emails.js";

export function registerAllTools(
  server: McpServer,
  provider: EmailProvider,
  pipeline: FilterPipeline,
) {
  registerSearchEmails(server, provider, pipeline);
  registerReadEmail(server, provider, pipeline);
  registerListThreads(server, provider, pipeline);
  registerGetThread(server, provider, pipeline);
  registerCreateDraft(server, provider);
  registerListDrafts(server, provider, pipeline);
  registerListLabels(server, provider, pipeline);
  registerProviderInfo(server, provider);
}
