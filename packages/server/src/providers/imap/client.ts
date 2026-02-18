import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { ImapCredentials } from "../../storage/types.js";
import type {
  CreateDraftInput,
  CreateDraftResult,
  DraftInfo,
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
import { decryptPassword } from "./crypto.js";
import { parseImapMessage } from "./parser.js";
import { parseGmailQuery } from "./query-parser.js";

export class ImapProvider implements EmailProvider {
  private credentials: ImapCredentials;
  private decryptedPassword: string;

  constructor(credentials: ImapCredentials, sessionSecret: string) {
    this.credentials = credentials;
    // Decrypt once at construction time to avoid repeated scryptSync calls
    this.decryptedPassword = decryptPassword(
      credentials.encryptedPassword,
      credentials.iv,
      credentials.authTag,
      sessionSecret,
    );
  }

  // ── Connection helper ──

  private async withConnection<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = new ImapFlow({
      host: this.credentials.host,
      port: this.credentials.port,
      secure: this.credentials.tls,
      auth: {
        user: this.credentials.username,
        pass: this.decryptedPassword,
      },
      logger: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });

    await client.connect();
    try {
      return await fn(client);
    } finally {
      try { await client.logout(); } catch { /* already disconnected */ }
    }
  }

  // ── EmailProvider interface ──

  async search(options: SearchOptions): Promise<SearchResult> {
    const { criteria, folder: logicalFolder } = parseGmailQuery(options.query);
    const maxResults = options.maxResults ?? 10;

    return this.withConnection(async (client) => {
      const folder = await resolveFolder(client, logicalFolder);
      const lock = await client.getMailboxLock(folder);
      try {
        const messages: EmailMessage[] = [];

        // Search and get UIDs
        const searchResult = await client.search(criteria, { uid: true });
        const uids = searchResult || [];
        // Most recent first
        const sortedUids = (uids as number[]).sort((a, b) => b - a);

        // Handle pagination via pageToken (a UID boundary)
        let startIdx = 0;
        if (options.pageToken) {
          const tokenUid = Number(options.pageToken);
          startIdx = sortedUids.findIndex((uid) => uid <= tokenUid);
          if (startIdx === -1) startIdx = sortedUids.length;
        }

        const pageUids = sortedUids.slice(startIdx, startIdx + maxResults);

        for (const uid of pageUids) {
          const msg = await this.fetchMessage(client, uid, folder);
          if (msg) {
            messages.push(msg);
          }
        }

        const nextIdx = startIdx + maxResults;
        return {
          messages,
          nextPageToken:
            nextIdx < sortedUids.length
              ? String(sortedUids[nextIdx])
              : undefined,
          resultSizeEstimate: sortedUids.length,
        };
      } finally {
        lock.release();
      }
    });
  }

  async getMessage(messageId: string): Promise<EmailMessage> {
    const { folder, uid } = parseMessageId(messageId);

    return this.withConnection(async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const msg = await this.fetchMessage(client, uid, folder);
        if (!msg) {
          throw new Error(`Message not found: ${messageId}`);
        }
        return msg;
      } finally {
        lock.release();
      }
    });
  }

  async listThreads(options: SearchOptions): Promise<ThreadListResult> {
    const { criteria, folder: logicalFolder } = parseGmailQuery(options.query);
    const maxResults = options.maxResults ?? 10;

    return this.withConnection(async (client) => {
      const folder = await resolveFolder(client, logicalFolder);
      const lock = await client.getMailboxLock(folder);
      try {
        const threadSearchResult = await client.search(criteria, { uid: true });
        const threadUids = threadSearchResult || [];
        const sortedUids = (threadUids as number[]).sort((a, b) => b - a);

        // Fetch envelopes and group by thread
        const threadMap = new Map<
          string,
          { messages: EmailMessage[]; threadId: string }
        >();

        // Fetch up to maxResults * 3 messages to build threads
        const fetchLimit = Math.min(sortedUids.length, maxResults * 3);
        const fetchUids = sortedUids.slice(0, fetchLimit);

        for (const uid of fetchUids) {
          const msg = await this.fetchMessage(client, uid, folder);
          if (!msg) continue;

          const tid = msg.threadId;
          const existing = threadMap.get(tid);
          if (existing) {
            existing.messages.push(msg);
          } else {
            threadMap.set(tid, { messages: [msg], threadId: tid });
          }
        }

        // Build threads, sorted by most recent message
        const threads: EmailThread[] = [];
        for (const [, entry] of threadMap) {
          entry.messages.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          );
          const latest = entry.messages[0];
          const participants = new Map<string, { name: string; email: string }>();
          for (const m of entry.messages) {
            participants.set(m.from.email, m.from);
            for (const to of m.to) participants.set(to.email, to);
          }

          threads.push({
            id: entry.threadId,
            subject: latest.subject,
            participants: Array.from(participants.values()),
            messageCount: entry.messages.length,
            snippet: latest.snippet,
            lastMessageDate: latest.date,
            labels: [...new Set(entry.messages.flatMap((m) => m.labels))],
            isUnread: entry.messages.some((m) => m.isUnread),
          });
        }

        // Sort by most recent, take maxResults
        threads.sort(
          (a, b) =>
            new Date(b.lastMessageDate).getTime() -
            new Date(a.lastMessageDate).getTime(),
        );
        const result = threads.slice(0, maxResults);

        return {
          threads: result,
          nextPageToken: undefined,
          resultSizeEstimate: threads.length,
        };
      } finally {
        lock.release();
      }
    });
  }

  async getThread(
    threadId: string,
  ): Promise<{ thread: EmailThread; messages: EmailMessage[] }> {
    // Search across INBOX for messages with matching thread ID.
    // Note: This scans recent messages — a known limitation of IMAP threading.
    return this.withConnection(async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        // Use SEARCH with a recent date range instead of fetching all UIDs
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const searchResult = await client.search(
          { since: oneMonthAgo },
          { uid: true },
        );
        const uids = searchResult || [];
        const sortedUids = (uids as number[]).sort((a, b) => b - a);
        // Scan up to 200 recent messages to find thread members
        const scanUids = sortedUids.slice(0, 200);

        const messages: EmailMessage[] = [];
        for (const uid of scanUids) {
          const msg = await this.fetchMessage(client, uid, "INBOX");
          if (msg && msg.threadId === threadId) {
            messages.push(msg);
          }
        }

        if (messages.length === 0) {
          throw new Error(`Thread not found: ${threadId}`);
        }

        messages.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

        const participants = new Map<string, { name: string; email: string }>();
        for (const m of messages) {
          participants.set(m.from.email, m.from);
          for (const to of m.to) participants.set(to.email, to);
        }

        const latest = messages[messages.length - 1];
        const thread: EmailThread = {
          id: threadId,
          subject: messages[0].subject,
          participants: Array.from(participants.values()),
          messageCount: messages.length,
          snippet: latest.snippet,
          lastMessageDate: latest.date,
          labels: [...new Set(messages.flatMap((m) => m.labels))],
          isUnread: messages.some((m) => m.isUnread),
        };

        return { thread, messages };
      } finally {
        lock.release();
      }
    });
  }

  async createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
    return this.withConnection(async (client) => {
      // Build RFC 2822 message
      const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@agentcloak>`;
      const headers = [
        `Message-ID: ${messageId}`,
        `To: ${input.to.join(", ")}`,
        `Subject: ${input.subject}`,
        `Date: ${new Date().toUTCString()}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        `MIME-Version: 1.0`,
      ];

      // Add In-Reply-To/References if this is a reply
      if (input.inReplyToThreadId) {
        headers.push(`In-Reply-To: ${input.inReplyToThreadId}`);
        headers.push(`References: ${input.inReplyToThreadId}`);
      }

      const raw = [...headers, "", input.body].join("\r\n");
      const draftsFolder = await this.findDraftsFolder(client);

      const appendResult = await client.append(
        draftsFolder,
        Buffer.from(raw),
        ["\\Draft", "\\Seen"],
      );

      // appendResult can be false if APPEND fails, or an object with uid
      // (uid is only available if the server supports UIDPLUS)
      let uid = 0;
      if (appendResult && typeof appendResult === "object") {
        uid = (appendResult as { uid?: number }).uid ?? 0;
      }

      return {
        draftId: uid > 0 ? `${draftsFolder}:${uid}` : `${draftsFolder}:draft-${Date.now()}`,
        messageId,
      };
    });
  }

  async listDrafts(maxResults?: number): Promise<DraftListResult> {
    const limit = maxResults ?? 10;

    return this.withConnection(async (client) => {
      const draftsFolder = await this.findDraftsFolder(client);
      const lock = await client.getMailboxLock(draftsFolder);
      try {
        const draftSearchResult = await client.search(
          { draft: true },
          { uid: true },
        );
        const draftUids = draftSearchResult || [];
        const sortedUids = (draftUids as number[]).sort((a, b) => b - a).slice(0, limit);

        const drafts: DraftInfo[] = [];
        for (const uid of sortedUids) {
          const msg = await this.fetchMessage(client, uid, draftsFolder);
          if (!msg) continue;
          drafts.push({
            id: `${draftsFolder}:${uid}`,
            messageId: msg.id,
            to: msg.to,
            subject: msg.subject,
            snippet: msg.snippet,
            updatedAt: msg.date,
          });
        }

        return { drafts };
      } finally {
        lock.release();
      }
    });
  }

  async listLabels(): Promise<LabelInfo[]> {
    return this.withConnection(async (client) => {
      const mailboxes = await client.list();
      const labels: LabelInfo[] = [];

      for (const mb of mailboxes) {
        try {
          const status = await client.status(mb.path, {
            messages: true,
            unseen: true,
          });
          labels.push({
            id: mb.path,
            name: mb.name,
            type: mb.specialUse ? "system" : "user",
            messagesTotal: status.messages ?? 0,
            messagesUnread: status.unseen ?? 0,
          });
        } catch {
          // Some folders may not support STATUS
          labels.push({
            id: mb.path,
            name: mb.name,
            type: mb.specialUse ? "system" : "user",
            messagesTotal: 0,
            messagesUnread: 0,
          });
        }
      }

      return labels;
    });
  }

  getProviderInfo(): ProviderInfo {
    return {
      type: "imap",
      searchCapabilities: [
        "from",
        "to",
        "subject",
        "is:unread",
        "is:read",
        "after:YYYY/MM/DD",
        "before:YYYY/MM/DD",
        "in:folder",
      ],
      supportsThreading: false,
      supportedFolders: ["INBOX", "Sent", "Drafts", "Trash", "Junk", "Archive"],
      limitations: [
        "No full-text body search (subject search only for free-text queries)",
        "Threading is simulated via References/In-Reply-To headers, not native",
        "IMAP has folders not labels — multi-label per message is not supported",
        "Search is less powerful than Gmail — complex queries may not match",
      ],
    };
  }

  // ── Helpers ──

  private async fetchMessage(
    client: ImapFlow,
    uid: number,
    folder: string,
  ): Promise<EmailMessage | null> {
    try {
      // Single FETCH command for both source and flags
      const msgData = await client.fetchOne(
        String(uid),
        { source: true, flags: true },
        { uid: true },
      );
      if (!msgData || typeof msgData !== "object" || !("source" in msgData)) {
        return null;
      }

      const data = msgData as { source?: Buffer; flags?: Set<string> };
      if (!data.source) return null;

      const parsed = await simpleParser(data.source);
      const flags = data.flags ?? new Set<string>();

      return parseImapMessage(parsed, uid, folder, flags);
    } catch (err) {
      console.error(`IMAP: failed to fetch message uid=${uid} folder=${folder}:`, err);
      return null;
    }
  }

  private async findDraftsFolder(client: ImapFlow): Promise<string> {
    return resolveFolder(client, "drafts");
  }
}

/** Maps logical folder names to RFC 6154 special-use attributes. */
const SPECIAL_USE_MAP: Record<string, string> = {
  sent: "\\Sent",
  trash: "\\Trash",
  drafts: "\\Drafts",
  junk: "\\Junk",
  archive: "\\Archive",
  flagged: "\\Flagged",
  all: "\\All",
};

/** Fallback folder names when special-use attributes are not available. */
const FALLBACK_NAMES: Record<string, string[]> = {
  sent: ["Sent", "Sent Messages", "Sent Items", "[Gmail]/Sent Mail", "INBOX.Sent"],
  trash: ["Trash", "Deleted Items", "Deleted Messages", "[Gmail]/Trash", "INBOX.Trash"],
  drafts: ["Drafts", "Draft", "[Gmail]/Drafts", "INBOX.Drafts"],
  junk: ["Junk", "Spam", "Junk E-mail", "[Gmail]/Spam", "INBOX.Junk"],
  archive: ["Archive", "Archives", "[Gmail]/All Mail", "INBOX.Archive"],
  flagged: ["Flagged", "Starred", "[Gmail]/Starred"],
  all: ["All Mail", "[Gmail]/All Mail"],
};

/**
 * Resolves a logical folder name (e.g. "sent", "trash") to the actual
 * IMAP mailbox path by querying the server's mailbox list.
 * Tries RFC 6154 special-use attributes first, then common folder names.
 */
async function resolveFolder(client: ImapFlow, logicalName: string): Promise<string> {
  if (logicalName === "inbox") return "INBOX";

  const specialUse = SPECIAL_USE_MAP[logicalName];
  if (!specialUse) {
    // Not a known logical name — treat as a literal folder path
    return logicalName;
  }

  const mailboxes = await client.list();

  // Try special-use attribute first (most reliable)
  for (const mb of mailboxes) {
    if (mb.specialUse === specialUse) return mb.path;
  }

  // Fall back to common folder names
  const fallbacks = FALLBACK_NAMES[logicalName] ?? [];
  for (const name of fallbacks) {
    const found = mailboxes.find(
      (mb) => mb.path.toLowerCase() === name.toLowerCase(),
    );
    if (found) return found.path;
  }

  // Last resort — use the first fallback name and hope it exists
  return fallbacks[0] ?? logicalName;
}

function parseMessageId(messageId: string): { folder: string; uid: number } {
  const colonIdx = messageId.lastIndexOf(":");
  if (colonIdx === -1) {
    return { folder: "INBOX", uid: Number.parseInt(messageId, 10) };
  }
  return {
    folder: messageId.slice(0, colonIdx),
    uid: Number.parseInt(messageId.slice(colonIdx + 1), 10),
  };
}
