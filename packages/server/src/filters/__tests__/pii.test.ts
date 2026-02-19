import { describe, it, expect } from "vitest";
import { PiiFilter } from "../pii.js";
import type { EmailMessage } from "../../providers/types.js";

function makeMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: "msg-1",
    threadId: "thread-1",
    subject: "Test subject",
    from: { name: "Sender", email: "sender@example.com" },
    to: [{ name: "Recipient", email: "recipient@example.com" }],
    cc: [],
    date: "2026-01-15T10:00:00Z",
    snippet: "Test snippet",
    body: "Test body",
    labels: ["INBOX"],
    attachments: [],
    isUnread: false,
    ...overrides,
  };
}

describe("PiiFilter", () => {
  describe("SSN redaction", () => {
    it("redacts SSN patterns", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({ body: "My SSN is 123-45-6789" });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[SSN_REDACTED]");
      expect(result.message.body).not.toContain("123-45-6789");
    });
  });

  describe("Credit card redaction", () => {
    it("redacts Visa card numbers", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({ body: "Card: 4111 1111 1111 1111" });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[CREDIT_CARD_REDACTED]");
      expect(result.message.body).not.toContain("4111 1111 1111 1111");
    });

    it("redacts Amex card numbers", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({ body: "Card: 3782-8224-6310-005" });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[CREDIT_CARD_REDACTED]");
      expect(result.message.body).not.toContain("3782-8224-6310-005");
    });
  });

  describe("API key redaction", () => {
    it("redacts Stripe secret keys (sk_live_)", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({
        body: "Key: sk_live_abc123def456ghi789jkl0",
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[API_KEY_REDACTED]");
      expect(result.message.body).not.toContain(
        "sk_live_abc123def456ghi789jkl0"
      );
    });

    it("redacts publishable keys (pk_test_)", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({
        body: "Key: pk_test_abc123def456ghi789jkl0",
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[API_KEY_REDACTED]");
      expect(result.message.body).not.toContain(
        "pk_test_abc123def456ghi789jkl0"
      );
    });
  });

  describe("AWS key redaction", () => {
    it("redacts AWS access key IDs", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({ body: "AWS key: AKIAIOSFODNN7EXAMPLE" });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[AWS_KEY_REDACTED]");
      expect(result.message.body).not.toContain("AKIAIOSFODNN7EXAMPLE");
    });
  });

  describe("Account number redaction", () => {
    it("redacts account numbers with label", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({ body: "Account number: 123456789" });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[ACCOUNT_REDACTED]");
      expect(result.message.body).not.toContain("123456789");
    });

    it("redacts card ending in pattern", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({ body: "card ending in 4242" });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[ACCOUNT_REDACTED]");
      expect(result.message.body).not.toContain("4242");
    });
  });

  describe("Routing number redaction", () => {
    it("redacts routing numbers", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({ body: "routing number: 021000021" });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[ROUTING_NUMBER_REDACTED]");
      expect(result.message.body).not.toContain("021000021");
    });
  });

  describe("Dollar amount redaction", () => {
    it("redacts dollar amounts when enabled", () => {
      const filter = new PiiFilter(true, true, true);
      const msg = makeMessage({ body: "Balance: $1,234.56" });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[AMOUNT_REDACTED]");
      expect(result.message.body).not.toContain("$1,234.56");
    });

    it("does NOT redact dollar amounts when disabled", () => {
      const filter = new PiiFilter(true, true, false);
      const msg = makeMessage({ body: "Balance: $1,234.56" });
      const result = filter.filter(msg);

      expect(result.message.body).toContain("$1,234.56");
      expect(result.message.body).not.toContain("[AMOUNT_REDACTED]");
    });
  });

  describe("Email address redaction", () => {
    it("redacts email addresses when enabled", () => {
      const filter = new PiiFilter(true, true, true);
      const msg = makeMessage({ body: "Contact: user@example.com" });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[EMAIL_REDACTED]");
      expect(result.message.body).not.toContain("user@example.com");
    });

    it("does NOT redact email addresses when disabled", () => {
      const filter = new PiiFilter(true, false, true);
      const msg = makeMessage({ body: "Contact: user@example.com" });
      const result = filter.filter(msg);

      expect(result.message.body).toContain("user@example.com");
      expect(result.message.body).not.toContain("[EMAIL_REDACTED]");
    });
  });

  describe("Bearer token redaction", () => {
    it("redacts Bearer tokens", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({
        body: "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc",
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("Bearer [TOKEN_REDACTED]");
      expect(result.message.body).not.toContain(
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc"
      );
    });
  });

  describe("Filter result actions", () => {
    it("returns 'pass' when nothing was redacted", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({ body: "Hello, this is a normal message." });
      const result = filter.filter(msg);

      expect(result.action).toBe("pass");
    });

    it("returns 'redact' when something was redacted", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({ body: "SSN: 123-45-6789" });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
    });

    it("returns 'pass' when filter is disabled entirely", () => {
      const filter = new PiiFilter(false);
      const msg = makeMessage({ body: "SSN: 123-45-6789" });
      const result = filter.filter(msg);

      expect(result.action).toBe("pass");
      expect(result.message.body).toContain("123-45-6789");
    });
  });

  describe("Multiple PII types", () => {
    it("redacts all PII types present in the same text", () => {
      const filter = new PiiFilter();
      const msg = makeMessage({
        body: "SSN: 123-45-6789, Card: 4111 1111 1111 1111, Key: AKIAIOSFODNN7EXAMPLE",
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("redact");
      expect(result.message.body).toContain("[SSN_REDACTED]");
      expect(result.message.body).toContain("[CREDIT_CARD_REDACTED]");
      expect(result.message.body).toContain("[AWS_KEY_REDACTED]");
      expect(result.message.body).not.toContain("123-45-6789");
      expect(result.message.body).not.toContain("4111 1111 1111 1111");
      expect(result.message.body).not.toContain("AKIAIOSFODNN7EXAMPLE");
    });
  });
});
