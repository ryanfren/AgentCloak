import { describe, it, expect, vi } from "vitest";
import { registerListThreads } from "../list-threads.js";
import { FilterPipeline } from "../../../filters/pipeline.js";
import type { EmailProvider, EmailThread } from "../../../providers/types.js";
import type { StoredFilterConfig } from "../../../storage/types.js";

function makeConfig(overrides: Partial<StoredFilterConfig> = {}): StoredFilterConfig {
  return {
    connectionId: "conn-1",
    blockedDomains: [],
    blockedSenderPatterns: [],
    blockedSubjectPatterns: [],
    piiRedactionEnabled: true,
    injectionDetectionEnabled: true,
    emailRedactionEnabled: true,
    showFilteredCount: true,
    securityBlockingEnabled: false,
    financialBlockingEnabled: false,
    sensitiveSenderBlockingEnabled: false,
    dollarAmountRedactionEnabled: true,
    attachmentFilteringEnabled: false,
    allowedFolders: [],
    ...overrides,
  };
}

function makeThread(overrides: Partial<EmailThread> = {}): EmailThread {
  return {
    id: "thread-1",
    subject: "Test Thread",
    participants: [
      { name: "Alice", email: "alice@safe.com" },
      { name: "Bob", email: "bob@work.com" },
    ],
    messageCount: 3,
    snippet: "This is a test snippet",
    lastMessageDate: "2026-01-15T10:00:00Z",
    labels: ["INBOX"],
    isUnread: false,
    ...overrides,
  };
}

function makeMockProvider(threads: EmailThread[]): EmailProvider {
  return {
    search: vi.fn(),
    getMessage: vi.fn(),
    listThreads: vi.fn().mockResolvedValue({
      threads,
      nextPageToken: undefined,
      resultSizeEstimate: threads.length,
    }),
    getThread: vi.fn(),
    createDraft: vi.fn(),
    listDrafts: vi.fn(),
    listLabels: vi.fn(),
    getProviderInfo: vi.fn(),
  } as unknown as EmailProvider;
}

function captureHandler(
  provider: EmailProvider,
  pipeline: FilterPipeline,
): (args: Record<string, unknown>) => Promise<unknown> {
  let handler: (args: Record<string, unknown>) => Promise<unknown>;
  const mockServer = {
    tool: (
      _name: string,
      _desc: string,
      _schema: unknown,
      fn: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      handler = fn;
    },
  };
  registerListThreads(mockServer as never, provider, pipeline);
  return handler!;
}

function parseResponse(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe("list_threads security", () => {
  describe("isThreadBlocked()", () => {
    it("blocks thread when ALL participants are from blocked domains", async () => {
      const config = makeConfig({ blockedDomains: ["evil.com"] });
      const pipeline = new FilterPipeline(config);
      const threads = [
        makeThread({
          id: "blocked",
          participants: [
            { name: "Bad1", email: "a@evil.com" },
            { name: "Bad2", email: "b@evil.com" },
          ],
        }),
      ];
      const provider = makeMockProvider(threads);
      const handler = captureHandler(provider, pipeline);

      const result = (await handler({
        query: "",
        max_results: 20,
      })) as { content: Array<{ text: string }> };

      const parsed = parseResponse(result);
      expect((parsed.threads as unknown[]).length).toBe(0);
    });

    it("keeps thread when ANY participant is from non-blocked domain", async () => {
      const config = makeConfig({ blockedDomains: ["evil.com"] });
      const pipeline = new FilterPipeline(config);
      const threads = [
        makeThread({
          id: "mixed",
          participants: [
            { name: "Bad", email: "a@evil.com" },
            { name: "Good", email: "b@safe.com" },
          ],
        }),
      ];
      const provider = makeMockProvider(threads);
      const handler = captureHandler(provider, pipeline);

      const result = (await handler({
        query: "",
        max_results: 20,
      })) as { content: Array<{ text: string }> };

      const parsed = parseResponse(result);
      expect((parsed.threads as unknown[]).length).toBe(1);
    });

    it("returns false (no blocking) when no blocked domains", async () => {
      const config = makeConfig({ blockedDomains: [] });
      const pipeline = new FilterPipeline(config);
      const threads = [
        makeThread({
          participants: [{ name: "Anyone", email: "anyone@any.com" }],
        }),
      ];
      const provider = makeMockProvider(threads);
      const handler = captureHandler(provider, pipeline);

      const result = (await handler({
        query: "",
        max_results: 20,
      })) as { content: Array<{ text: string }> };

      const parsed = parseResponse(result);
      expect((parsed.threads as unknown[]).length).toBe(1);
    });
  });

  describe("PII redaction", () => {
    it("redacts PII in subject via pipeline.redactText()", async () => {
      const pipeline = new FilterPipeline(makeConfig());
      const threads = [
        makeThread({ subject: "SSN: 123-45-6789 in subject" }),
      ];
      const provider = makeMockProvider(threads);
      const handler = captureHandler(provider, pipeline);

      const result = (await handler({
        query: "",
        max_results: 20,
      })) as { content: Array<{ text: string }> };

      const parsed = parseResponse(result);
      const thread = (parsed.threads as Array<{ subject: string }>)[0];
      expect(thread.subject).toContain("[SSN_REDACTED]");
      expect(thread.subject).not.toContain("123-45-6789");
    });

    it("redacts PII in snippet via pipeline.redactText()", async () => {
      const pipeline = new FilterPipeline(makeConfig());
      const threads = [
        makeThread({ snippet: "My card is 4111 1111 1111 1111" }),
      ];
      const provider = makeMockProvider(threads);
      const handler = captureHandler(provider, pipeline);

      const result = (await handler({
        query: "",
        max_results: 20,
      })) as { content: Array<{ text: string }> };

      const parsed = parseResponse(result);
      const thread = (parsed.threads as Array<{ snippet: string }>)[0];
      expect(thread.snippet).toContain("[CREDIT_CARD_REDACTED]");
      expect(thread.snippet).not.toContain("4111 1111 1111 1111");
    });
  });

  describe("filteredCount", () => {
    it("reports filteredCount when showFilteredCount is true and threads were blocked", async () => {
      const config = makeConfig({
        blockedDomains: ["evil.com"],
        showFilteredCount: true,
      });
      const pipeline = new FilterPipeline(config);
      const threads = [
        makeThread({
          id: "good",
          participants: [{ name: "Good", email: "good@safe.com" }],
        }),
        makeThread({
          id: "bad",
          participants: [{ name: "Bad", email: "bad@evil.com" }],
        }),
      ];
      const provider = makeMockProvider(threads);
      const handler = captureHandler(provider, pipeline);

      const result = (await handler({
        query: "",
        max_results: 20,
      })) as { content: Array<{ text: string }> };

      const parsed = parseResponse(result);
      expect(parsed.filteredCount).toBe(1);
    });

    it("does NOT report filteredCount when showFilteredCount is false", async () => {
      const config = makeConfig({
        blockedDomains: ["evil.com"],
        showFilteredCount: false,
      });
      const pipeline = new FilterPipeline(config);
      const threads = [
        makeThread({
          id: "bad",
          participants: [{ name: "Bad", email: "bad@evil.com" }],
        }),
      ];
      const provider = makeMockProvider(threads);
      const handler = captureHandler(provider, pipeline);

      const result = (await handler({
        query: "",
        max_results: 20,
      })) as { content: Array<{ text: string }> };

      const parsed = parseResponse(result);
      expect(parsed.filteredCount).toBeUndefined();
    });
  });
});
