import { decryptPassword } from "../imap/crypto.js";
import type { GasCredentials } from "../../storage/types.js";
import type {
  CreateDraftInput,
  CreateDraftResult,
  DraftListResult,
  EmailMessage,
  EmailProvider,
  EmailThread,
  LabelInfo,
  ProviderInfo,
  SearchOptions,
  SearchResult,
  ThreadListResult,
} from "../types.js";

const CURRENT_VERSION = 1;

interface GasResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  version?: number;
}

export class GasProvider implements EmailProvider {
  private endpointUrl: string;
  private secret: string;

  constructor(credentials: GasCredentials, sessionSecret: string) {
    this.endpointUrl = credentials.endpointUrl;
    this.secret = decryptPassword(
      credentials.encryptedSecret,
      credentials.iv,
      credentials.authTag,
      sessionSecret,
    );
  }

  // ── Core HTTP helper ──

  private async callGas<T>(
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const res = await fetch(this.endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: this.secret, action, ...params }),
        redirect: "follow",
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`GAS endpoint returned HTTP ${res.status}`);
      }

      const json = (await res.json()) as GasResponse<T>;

      if (json.version != null && json.version < CURRENT_VERSION) {
        console.warn(
          `GAS script version ${json.version} is outdated (current: ${CURRENT_VERSION}). ` +
            "Ask the user to update their Apps Script deployment.",
        );
      }

      if (!json.ok) {
        throw new Error(json.error ?? "Unknown error from GAS endpoint");
      }

      return json.data as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(
          "GAS endpoint timed out after 90 seconds. " +
            "Make sure the script is deployed and accessible.",
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Static ping for connection setup ──

  static async ping(
    endpointUrl: string,
    secret: string,
  ): Promise<{ email: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, action: "ping" }),
        redirect: "follow",
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`GAS endpoint returned HTTP ${res.status}`);
      }

      const json = (await res.json()) as GasResponse<{ email: string }>;

      if (!json.ok) {
        throw new Error(json.error ?? "Ping failed");
      }

      return json.data as { email: string };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(
          "GAS endpoint timed out after 30 seconds. " +
            "Make sure the script is deployed as a web app with 'Anyone' access.",
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── EmailProvider interface ──

  async search(options: SearchOptions): Promise<SearchResult> {
    const offset = options.pageToken ? Number(options.pageToken) : 0;
    const maxResults = options.maxResults ?? 10;

    const data = await this.callGas<{
      messages: EmailMessage[];
      hasMore: boolean;
      total: number;
    }>("search", {
      query: options.query,
      offset,
      maxResults,
    });

    return {
      messages: data.messages,
      nextPageToken: data.hasMore ? String(offset + maxResults) : undefined,
      resultSizeEstimate: data.total,
    };
  }

  async getMessage(messageId: string): Promise<EmailMessage> {
    return this.callGas<EmailMessage>("getMessage", { messageId });
  }

  async listThreads(options: SearchOptions): Promise<ThreadListResult> {
    const offset = options.pageToken ? Number(options.pageToken) : 0;
    const maxResults = options.maxResults ?? 10;

    const data = await this.callGas<{
      threads: EmailThread[];
      hasMore: boolean;
      total: number;
    }>("listThreads", {
      query: options.query,
      offset,
      maxResults,
    });

    return {
      threads: data.threads,
      nextPageToken: data.hasMore ? String(offset + maxResults) : undefined,
      resultSizeEstimate: data.total,
    };
  }

  async getThread(
    threadId: string,
  ): Promise<{ thread: EmailThread; messages: EmailMessage[] }> {
    return this.callGas<{ thread: EmailThread; messages: EmailMessage[] }>(
      "getThread",
      { threadId },
    );
  }

  async createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
    return this.callGas<CreateDraftResult>("createDraft", {
      to: input.to,
      subject: input.subject,
      body: input.body,
      inReplyToThreadId: input.inReplyToThreadId,
    });
  }

  async listDrafts(maxResults?: number): Promise<DraftListResult> {
    return this.callGas<DraftListResult>("listDrafts", {
      maxResults: maxResults ?? 10,
    });
  }

  async listLabels(): Promise<LabelInfo[]> {
    return this.callGas<LabelInfo[]>("listLabels");
  }

  getProviderInfo(): ProviderInfo {
    return {
      type: "gas",
      searchCapabilities: [
        "from",
        "to",
        "subject",
        "body",
        "has:attachment",
        "is:unread",
        "is:read",
        "is:starred",
        "after:YYYY/MM/DD",
        "before:YYYY/MM/DD",
        "label:name",
        "in:inbox",
        "in:sent",
        "in:trash",
      ],
      supportsThreading: true,
      supportedFolders: [
        "INBOX",
        "SENT",
        "DRAFTS",
        "TRASH",
        "SPAM",
        "STARRED",
        "IMPORTANT",
      ],
      limitations: [
        "Runs via Google Apps Script — subject to GAS execution time limits (6 minutes)",
        "GmailApp.search() returns at most 500 threads per call",
        "No real-time push notifications — polling only",
        "Script must be redeployed after updates",
        "resultSizeEstimate is a minimum estimate, not an exact total",
      ],
    };
  }
}
