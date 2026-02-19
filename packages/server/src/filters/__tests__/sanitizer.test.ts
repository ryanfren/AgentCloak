import { describe, it, expect } from "vitest";
import { SanitizerFilter } from "../sanitizer.js";
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

describe("SanitizerFilter", () => {
  describe("Unicode stripping from body", () => {
    it("strips zero-width space (U+200B)", () => {
      const filter = new SanitizerFilter();
      const msg = makeMessage({ body: "Hello\u200Bworld" });
      const result = filter.filter(msg);

      expect(result.message.body).toBe("Helloworld");
    });

    it("strips zero-width non-joiner (U+200C)", () => {
      const filter = new SanitizerFilter();
      const msg = makeMessage({ body: "Hello\u200Cworld" });
      const result = filter.filter(msg);

      expect(result.message.body).toBe("Helloworld");
    });

    it("strips bidi override characters (U+202A-U+202E)", () => {
      const filter = new SanitizerFilter();
      const msg = makeMessage({
        body: "Hello\u202Aworld\u202B!\u202C\u202D\u202E",
      });
      const result = filter.filter(msg);

      expect(result.message.body).toBe("Helloworld!");
    });

    it("strips BOM / FEFF", () => {
      const filter = new SanitizerFilter();
      const msg = makeMessage({ body: "\uFEFFHello world" });
      const result = filter.filter(msg);

      expect(result.message.body).toBe("Hello world");
    });

    it("strips soft hyphen (U+00AD)", () => {
      const filter = new SanitizerFilter();
      const msg = makeMessage({ body: "soft\u00ADhyphen" });
      const result = filter.filter(msg);

      expect(result.message.body).toBe("softhyphen");
    });
  });

  describe("Unicode stripping from subject and snippet", () => {
    it("strips unicode from subject and snippet", () => {
      const filter = new SanitizerFilter();
      const msg = makeMessage({
        subject: "Subject\u200B with\u200C hidden\u00AD chars",
        snippet: "Snippet\uFEFF with\u202A bidi\u202E chars",
        body: "Normal body",
      });
      const result = filter.filter(msg);

      expect(result.message.subject).toBe("Subject with hidden chars");
      expect(result.message.snippet).toBe("Snippet with bidi chars");
    });
  });

  describe("HTML body handling", () => {
    it("removes htmlBody field from output", () => {
      const filter = new SanitizerFilter();
      const msg = makeMessage({
        body: "Plain text body",
        htmlBody: "<p>HTML body</p>",
      });
      const result = filter.filter(msg);

      expect(result.message.htmlBody).toBeUndefined();
    });

    it("uses HTML-converted text as body when plaintext body is empty", () => {
      const filter = new SanitizerFilter();
      const msg = makeMessage({
        body: "",
        htmlBody: "<p>Hello world</p>",
      });
      const result = filter.filter(msg);

      expect(result.message.body).toContain("Hello world");
      expect(result.message.htmlBody).toBeUndefined();
    });

    it("preserves existing plaintext body when htmlBody is also present", () => {
      const filter = new SanitizerFilter();
      const msg = makeMessage({
        body: "Original plaintext body",
        htmlBody: "<p>HTML version</p>",
      });
      const result = filter.filter(msg);

      expect(result.message.body).toBe("Original plaintext body");
      expect(result.message.htmlBody).toBeUndefined();
    });
  });

  describe("Normal text passthrough", () => {
    it("passes normal text through unchanged", () => {
      const filter = new SanitizerFilter();
      const msg = makeMessage({
        body: "This is a perfectly normal email body with no special characters.",
        subject: "Normal subject line",
        snippet: "Normal snippet",
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("pass");
      expect(result.message.body).toBe(
        "This is a perfectly normal email body with no special characters."
      );
      expect(result.message.subject).toBe("Normal subject line");
      expect(result.message.snippet).toBe("Normal snippet");
    });
  });
});
