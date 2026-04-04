import { describe, it, expect } from "vitest";
import { BlocklistFilter } from "../blocklist.js";
import type { EmailMessage } from "../../providers/types.js";
import type { StoredFilterConfig } from "../../storage/types.js";

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

function makeFilterConfig(
  overrides: Partial<StoredFilterConfig> = {}
): StoredFilterConfig {
  return {
    connectionId: "conn-1",
    blockedDomains: [],
    blockedSenderPatterns: [],
    blockedSubjectPatterns: [],
    piiRedactionEnabled: true,
    injectionDetectionEnabled: true,
    emailRedactionEnabled: true,
    showFilteredCount: true,
    securityBlockingEnabled: true,
    financialBlockingEnabled: true,
    sensitiveSenderBlockingEnabled: true,
    dollarAmountRedactionEnabled: true,
    attachmentFilteringEnabled: false,
    allowedFolders: [],
    ...overrides,
  };
}

describe("BlocklistFilter", () => {
  describe("Financial domain blocking", () => {
    it("blocks email from chase.com", () => {
      const filter = new BlocklistFilter();
      const msg = makeMessage({
        from: { name: "Chase", email: "alerts@chase.com" },
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("block");
    });

    it("blocks email from paypal.com", () => {
      const filter = new BlocklistFilter();
      const msg = makeMessage({
        from: { name: "PayPal", email: "service@paypal.com" },
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("block");
    });

    it("blocks email from irs.gov", () => {
      const filter = new BlocklistFilter();
      const msg = makeMessage({
        from: { name: "IRS", email: "noreply@irs.gov" },
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("block");
    });
  });

  describe("Sensitive sender blocking", () => {
    it("blocks email from security@example.com", () => {
      const filter = new BlocklistFilter();
      const msg = makeMessage({
        from: { name: "Security Team", email: "security@example.com" },
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("block");
    });

    it("blocks email from fraud@bank.com", () => {
      const filter = new BlocklistFilter();
      const msg = makeMessage({
        from: { name: "Fraud Dept", email: "fraud@bank.com" },
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("block");
    });
  });

  describe("Security subject blocking", () => {
    it("blocks email with 'password reset' subject", () => {
      const filter = new BlocklistFilter();
      const msg = makeMessage({
        subject: "password reset",
        from: { name: "App", email: "noreply@someapp.com" },
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("block");
    });

    it("blocks email with financial statement subject", () => {
      const filter = new BlocklistFilter();
      const msg = makeMessage({
        subject: "Your bank statement is available",
        from: { name: "Notifications", email: "noreply@someservice.com" },
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("block");
    });
  });

  describe("Normal email passthrough", () => {
    it("passes normal email from normal-company.com", () => {
      const filter = new BlocklistFilter();
      const msg = makeMessage({
        from: { name: "Contact", email: "hello@normal-company.com" },
        subject: "Meeting tomorrow",
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("pass");
    });
  });

  describe("Subdomain blocking", () => {
    it("blocks subdomain of blocked domain (alerts.chase.com)", () => {
      const filter = new BlocklistFilter();
      const msg = makeMessage({
        from: { name: "Chase Alerts", email: "noreply@alerts.chase.com" },
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("block");
    });
  });

  describe("Custom blocked domains", () => {
    it("blocks custom domain from config", () => {
      const config = makeFilterConfig({
        blockedDomains: ["custom.com"],
      });
      const filter = new BlocklistFilter(config);
      const msg = makeMessage({
        from: { name: "Custom", email: "info@custom.com" },
        subject: "Hello",
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("block");
    });
  });

  describe("Category toggle: financial blocking disabled", () => {
    it("passes email from chase.com when financial blocking is disabled", () => {
      const config = makeFilterConfig({
        financialBlockingEnabled: false,
        sensitiveSenderBlockingEnabled: false,
      });
      const filter = new BlocklistFilter(config);
      const msg = makeMessage({
        from: { name: "Chase", email: "info@chase.com" },
        subject: "Hello from Chase",
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("pass");
    });
  });

  describe("Category toggle: security blocking disabled", () => {
    it("passes 'password reset' subject when security blocking is disabled", () => {
      const config = makeFilterConfig({
        securityBlockingEnabled: false,
      });
      const filter = new BlocklistFilter(config);
      const msg = makeMessage({
        from: { name: "App", email: "noreply@someapp.com" },
        subject: "password reset",
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("pass");
    });
  });

  describe("Category toggle: sensitive sender blocking disabled", () => {
    it("passes security@example.com when sensitive sender blocking is disabled", () => {
      const config = makeFilterConfig({
        sensitiveSenderBlockingEnabled: false,
      });
      const filter = new BlocklistFilter(config);
      const msg = makeMessage({
        from: { name: "Security Team", email: "security@example.com" },
        subject: "Hello",
      });
      const result = filter.filter(msg);

      expect(result.action).toBe("pass");
    });
  });
});
