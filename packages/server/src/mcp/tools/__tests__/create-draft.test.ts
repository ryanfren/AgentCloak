import { describe, it, expect, vi } from "vitest";
import { registerCreateDraft } from "../create-draft.js";
import { FilterPipeline } from "../../../filters/pipeline.js";
import type { EmailProvider } from "../../../providers/types.js";
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

function makeMockProvider(overrides: Partial<EmailProvider> = {}): EmailProvider {
  return {
    search: vi.fn(),
    getMessage: vi.fn(),
    listThreads: vi.fn(),
    getThread: vi.fn().mockResolvedValue({
      thread: {
        id: "thread-1",
        subject: "Re: Test",
        participants: [
          { name: "Alice", email: "alice@safe.com" },
          { name: "Bob", email: "bob@safe.com" },
        ],
        messageCount: 2,
        snippet: "...",
        lastMessageDate: "2026-01-15T10:00:00Z",
        labels: ["INBOX"],
        isUnread: false,
      },
      messages: [],
    }),
    createDraft: vi.fn().mockResolvedValue({
      draftId: "draft-123",
      messageId: "msg-456",
    }),
    listDrafts: vi.fn(),
    listLabels: vi.fn(),
    getProviderInfo: vi.fn(),
    ...overrides,
  } as unknown as EmailProvider;
}

// Capture the tool handler during registration
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
  registerCreateDraft(mockServer as never, provider, pipeline);
  return handler!;
}

describe("create_draft security", () => {
  it("blocks recipient on a blocked domain (exact match)", async () => {
    const pipeline = new FilterPipeline(makeConfig({ blockedDomains: ["evil.com"] }));
    const provider = makeMockProvider();
    const handler = captureHandler(provider, pipeline);

    const result = (await handler({
      to: ["attacker@evil.com"],
      subject: "Test",
      body: "Hello",
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("blocked");
    expect(parsed.reason).toContain("evil.com");
    expect(provider.createDraft).not.toHaveBeenCalled();
  });

  it("blocks recipient on a subdomain of blocked domain", async () => {
    const pipeline = new FilterPipeline(makeConfig({ blockedDomains: ["evil.com"] }));
    const provider = makeMockProvider();
    const handler = captureHandler(provider, pipeline);

    const result = (await handler({
      to: ["attacker@mail.evil.com"],
      subject: "Test",
      body: "Hello",
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("blocked");
    expect(parsed.reason).toContain("mail.evil.com");
    expect(provider.createDraft).not.toHaveBeenCalled();
  });

  it("allows recipient on non-blocked domain", async () => {
    const pipeline = new FilterPipeline(makeConfig({ blockedDomains: ["evil.com"] }));
    const provider = makeMockProvider();
    const handler = captureHandler(provider, pipeline);

    const result = (await handler({
      to: ["friend@safe.com"],
      subject: "Test",
      body: "Hello",
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.draftId).toBe("draft-123");
    expect(provider.createDraft).toHaveBeenCalled();
  });

  it("blocks if any one recipient is on a blocked domain (mixed recipients)", async () => {
    const pipeline = new FilterPipeline(makeConfig({ blockedDomains: ["evil.com"] }));
    const provider = makeMockProvider();
    const handler = captureHandler(provider, pipeline);

    const result = (await handler({
      to: ["friend@safe.com", "attacker@evil.com"],
      subject: "Test",
      body: "Hello",
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("blocked");
    expect(provider.createDraft).not.toHaveBeenCalled();
  });

  it("strips CRLF from subject (header injection prevention)", async () => {
    const pipeline = new FilterPipeline(makeConfig());
    const provider = makeMockProvider();
    const handler = captureHandler(provider, pipeline);

    await handler({
      to: ["user@safe.com"],
      subject: "Hello\r\nBcc: attacker@evil.com",
      body: "Test",
    });

    expect(provider.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Hello  Bcc: attacker@evil.com",
      }),
    );
  });

  it("returns error when no recipients and no thread ID", async () => {
    const pipeline = new FilterPipeline(makeConfig());
    const provider = makeMockProvider();
    const handler = captureHandler(provider, pipeline);

    const result = (await handler({
      subject: "Test",
      body: "Hello",
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("No recipients");
    expect(provider.createDraft).not.toHaveBeenCalled();
  });

  it("returns draftId and messageId on successful creation", async () => {
    const pipeline = new FilterPipeline(makeConfig());
    const provider = makeMockProvider();
    const handler = captureHandler(provider, pipeline);

    const result = (await handler({
      to: ["user@safe.com"],
      subject: "Hello",
      body: "World",
    })) as { content: Array<{ text: string }> };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.draftId).toBe("draft-123");
    expect(parsed.messageId).toBe("msg-456");
    expect(parsed.status).toContain("Draft created");
  });
});
