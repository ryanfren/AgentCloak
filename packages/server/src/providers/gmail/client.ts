import { google, type gmail_v1 } from "googleapis";
import type { Config } from "../../config.js";
import type { OAuthTokens, Storage } from "../../storage/types.js";
import type {
  CreateDraftInput,
  CreateDraftResult,
  DraftInfo,
  DraftListResult,
  EmailMessage,
  EmailProvider,
  EmailThread,
  LabelInfo,
  SearchOptions,
  SearchResult,
  ThreadListResult,
} from "../types.js";
import { createOAuth2Client } from "./oauth.js";
import { parseEmailAddress, parseGmailMessage } from "./parser.js";

export class GmailProvider implements EmailProvider {
  private gmail: gmail_v1.Gmail;
  private userId: string;

  constructor(
    config: Config,
    tokens: OAuthTokens,
    userId: string,
    storage: Storage,
  ) {
    this.userId = userId;
    const auth = createOAuth2Client(config);
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiresAt,
    });

    // Persist refreshed tokens
    auth.on("tokens", (newTokens) => {
      const updated: OAuthTokens = {
        accessToken: newTokens.access_token ?? tokens.accessToken,
        refreshToken: newTokens.refresh_token ?? tokens.refreshToken,
        expiresAt: newTokens.expiry_date ?? Date.now() + 3600 * 1000,
        scope: newTokens.scope ?? tokens.scope,
      };
      storage.updateTokens(userId, updated).catch(console.error);
    });

    this.gmail = google.gmail({ version: "v1", auth });
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const res = await this.gmail.users.messages.list({
      userId: "me",
      q: options.query,
      maxResults: options.maxResults ?? 10,
      pageToken: options.pageToken,
    });

    const messageIds = res.data.messages ?? [];
    const messages = await this.batchGetMessages(messageIds.map((m) => m.id!));

    return {
      messages,
      nextPageToken: res.data.nextPageToken ?? undefined,
      resultSizeEstimate: res.data.resultSizeEstimate ?? 0,
    };
  }

  async getMessage(messageId: string): Promise<EmailMessage> {
    const res = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    return parseGmailMessage(res.data);
  }

  async listThreads(options: SearchOptions): Promise<ThreadListResult> {
    const res = await this.gmail.users.threads.list({
      userId: "me",
      q: options.query,
      maxResults: options.maxResults ?? 10,
      pageToken: options.pageToken,
    });

    const threadIds = res.data.threads ?? [];
    const threads: EmailThread[] = [];

    for (const t of threadIds) {
      const threadRes = await this.gmail.users.threads.get({
        userId: "me",
        id: t.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "To", "Date"],
      });

      const msgs = threadRes.data.messages ?? [];
      const firstMsg = msgs[0];
      const lastMsg = msgs[msgs.length - 1];
      const headers = firstMsg?.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

      const participants = new Map<string, { name: string; email: string }>();
      for (const m of msgs) {
        for (const h of m.payload?.headers ?? []) {
          if (h.name?.toLowerCase() === "from" && h.value) {
            const addr = parseEmailAddress(h.value);
            participants.set(addr.email, addr);
          }
        }
      }

      threads.push({
        id: t.id!,
        subject: getHeader("Subject"),
        participants: Array.from(participants.values()),
        messageCount: msgs.length,
        snippet: lastMsg?.snippet ?? "",
        lastMessageDate:
          (lastMsg?.payload?.headers ?? []).find(
            (h) => h.name?.toLowerCase() === "date",
          )?.value ?? "",
        labels: [...new Set(msgs.flatMap((m) => m.labelIds ?? []))],
        isUnread: msgs.some((m) => m.labelIds?.includes("UNREAD")),
      });
    }

    return {
      threads,
      nextPageToken: res.data.nextPageToken ?? undefined,
      resultSizeEstimate: res.data.resultSizeEstimate ?? 0,
    };
  }

  async getThread(
    threadId: string,
  ): Promise<{ thread: EmailThread; messages: EmailMessage[] }> {
    const res = await this.gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const msgs = (res.data.messages ?? []).map(parseGmailMessage);
    const participants = new Map<string, { name: string; email: string }>();
    for (const m of msgs) {
      participants.set(m.from.email, m.from);
      for (const to of m.to) participants.set(to.email, to);
    }

    const thread: EmailThread = {
      id: threadId,
      subject: msgs[0]?.subject ?? "",
      participants: Array.from(participants.values()),
      messageCount: msgs.length,
      snippet: msgs[msgs.length - 1]?.snippet ?? "",
      lastMessageDate: msgs[msgs.length - 1]?.date ?? "",
      labels: [...new Set(msgs.flatMap((m) => m.labels))],
      isUnread: msgs.some((m) => m.isUnread),
    };

    return { thread, messages: msgs };
  }

  async createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
    const lines = [
      `To: ${input.to.join(", ")}`,
      `Subject: ${input.subject}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      "",
      input.body,
    ];
    const raw = Buffer.from(lines.join("\r\n")).toString("base64url");

    const res = await this.gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw,
          threadId: input.inReplyToThreadId,
        },
      },
    });

    return {
      draftId: res.data.id!,
      messageId: res.data.message?.id ?? "",
    };
  }

  async listDrafts(maxResults?: number): Promise<DraftListResult> {
    const res = await this.gmail.users.drafts.list({
      userId: "me",
      maxResults: maxResults ?? 10,
    });

    const drafts: DraftInfo[] = [];
    for (const d of res.data.drafts ?? []) {
      const detail = await this.gmail.users.drafts.get({
        userId: "me",
        id: d.id!,
        format: "metadata",
      });
      const headers = detail.data.message?.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h: { name?: string | null; value?: string | null }) =>
          h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

      drafts.push({
        id: d.id!,
        messageId: detail.data.message?.id ?? "",
        to: getHeader("To")
          ? getHeader("To")
              .split(",")
              .map((s: string) => parseEmailAddress(s.trim()))
          : [],
        subject: getHeader("Subject"),
        snippet: detail.data.message?.snippet ?? "",
        updatedAt:
          headers.find((h: { name?: string | null }) =>
            h.name?.toLowerCase() === "date")?.value ?? "",
      });
    }

    return { drafts };
  }

  async listLabels(): Promise<LabelInfo[]> {
    const res = await this.gmail.users.labels.list({ userId: "me" });
    const labels: LabelInfo[] = [];

    for (const l of res.data.labels ?? []) {
      const detail = await this.gmail.users.labels.get({
        userId: "me",
        id: l.id!,
      });
      labels.push({
        id: l.id!,
        name: l.name ?? "",
        type: l.type === "system" ? "system" : "user",
        messagesTotal: detail.data.messagesTotal ?? 0,
        messagesUnread: detail.data.messagesUnread ?? 0,
      });
    }

    return labels;
  }

  private async batchGetMessages(ids: string[]): Promise<EmailMessage[]> {
    const messages: EmailMessage[] = [];
    for (const id of ids) {
      const msg = await this.getMessage(id);
      messages.push(msg);
    }
    return messages;
  }
}
