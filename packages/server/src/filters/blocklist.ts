import type { EmailMessage } from "../providers/types.js";
import type { StoredFilterConfig } from "../storage/types.js";
import type { EmailFilter, FilterResult } from "./types.js";

// Financial domains (banks, payments, investment, mortgage, gov financial)
const FINANCIAL_BLOCKED_DOMAINS = [
  // Major banks
  "chase.com",
  "bankofamerica.com",
  "wellsfargo.com",
  "wellsfargoadvisors.com",
  "citibank.com",
  "citicards.com",
  "capitalone.com",
  "usbank.com",
  "pnc.com",
  "tdbank.com",
  "ally.com",
  "synchronybank.com",
  "synchrony.com",
  // Credit unions
  "uccu.com",
  "navyfederal.org",
  // Payment processors
  "paypal.com",
  "venmo.com",
  "zelle.com",
  "squareup.com",
  "cash.app",
  "stripe.com",
  "xpressbillpay.com",
  // Credit cards
  "americanexpress.com",
  "discover.com",
  // Investment & brokerage
  "coinbase.com",
  "robinhood.com",
  "fidelity.com",
  "schwab.com",
  "vanguard.com",
  "betterment.com",
  "wealthfront.com",
  "etrade.com",
  // Mortgage & loans
  "newrez.com",
  "newrezservicing.com",
  "loancare.com",
  "mrcooper.com",
  // Government financial
  "irs.gov",
  "ssa.gov",
];

// Sensitive sender patterns (security/verification senders)
const SENSITIVE_SENDER_PATTERNS = [
  "noreply@.*\\.gov$",
  "security@",
  "security-noreply@",
  "account-security-noreply@",
  "account-security@",
  "verify@",
  "no-reply@.*bank",
  "alerts?@",
  "fraud@",
  "authentication@",
  "noreply@.*\\.bank$",
  "noreply@.*financial",
  "accountprotection\\.",
];

// Security subject patterns (passwords, 2FA, verification, login alerts)
const SECURITY_SUBJECT_PATTERNS = [
  // Password & credentials
  "password reset",
  "reset your password",
  "new password",
  "password updated",
  "password changed",
  "your (temporary |new )?password",
  // Codes, PINs, OTPs
  "your code (for|is)",
  "confirmation code",
  "here.?s your (pin|code)",
  "your pin",
  "single.?use code",
  "one.?time (password|code|pin)",
  "otp\\b",
  "verification code",
  "security code",
  "login code",
  "sign.?in code",
  // Account verification & activation
  "activation link",
  "activate your",
  "confirm your",
  "verify your",
  "email verification",
  // Sign-in & login
  "new sign.?in",
  "sign.?in (attempt|link|activity)",
  "login attempt",
  "sign.?in to your",
  "signed? in (to|from)",
  "new device",
  "magic link",
  // Security
  "two.?factor",
  "2fa",
  "security (alert|info|notice|update)",
  "suspicious (activity|sign.?in|login)",
  "unusual activity",
  "unauthorized (access|attempt)",
];

// Financial subject patterns (statements, payments, tax docs)
const FINANCIAL_SUBJECT_PATTERNS = [
  "wire transfer",
  "tax (document|return|form|statement|receipt)",
  "w-?2",
  "1099",
  "bank statement",
  "account statement",
  "billing statement",
  "your statement is",
  "statement is (now )?available",
  "credit (score|report)",
  "social security",
  "recurring payment",
  "payment (successful|confirmed|drafted|processed|received)",
  "payment confirmation",
  "payment receipt",
  "payment has been",
  "automatic payment",
  "owner statement",
  "tax receipt",
  "auto.?pay",
  "statement is (now )?(available|here|ready)",
  "your .* statement",
  "subscription receipt",
];

export class BlocklistFilter implements EmailFilter {
  name = "blocklist";
  private blockedDomains: string[];
  private senderPatterns: RegExp[];
  private subjectPatterns: RegExp[];

  constructor(userConfig?: StoredFilterConfig | null) {
    // Domains: financial defaults (conditional) + user custom (always)
    const domains: string[] = [];
    if (userConfig?.financialBlockingEnabled !== false) {
      domains.push(...FINANCIAL_BLOCKED_DOMAINS);
    }
    domains.push(...(userConfig?.blockedDomains ?? []));
    this.blockedDomains = domains;

    // Sender patterns: sensitive sender defaults (conditional) + user custom (always)
    const senderStrs: string[] = [];
    if (userConfig?.sensitiveSenderBlockingEnabled !== false) {
      senderStrs.push(...SENSITIVE_SENDER_PATTERNS);
    }
    senderStrs.push(...(userConfig?.blockedSenderPatterns ?? []));
    this.senderPatterns = senderStrs
      .map((p) => safeRegExp(p))
      .filter((r): r is RegExp => r !== null);

    // Subject patterns: security defaults + financial defaults (conditional) + user custom (always)
    const subjectStrs: string[] = [];
    if (userConfig?.securityBlockingEnabled !== false) {
      subjectStrs.push(...SECURITY_SUBJECT_PATTERNS);
    }
    if (userConfig?.financialBlockingEnabled !== false) {
      subjectStrs.push(...FINANCIAL_SUBJECT_PATTERNS);
    }
    subjectStrs.push(...(userConfig?.blockedSubjectPatterns ?? []));
    this.subjectPatterns = subjectStrs
      .map((p) => safeRegExp(p))
      .filter((r): r is RegExp => r !== null);
  }

  getBlockedDomains(): string[] {
    return this.blockedDomains;
  }

  filter(message: EmailMessage): FilterResult {
    const senderEmail = message.from.email.toLowerCase();
    const senderDomain = senderEmail.split("@")[1] ?? "";

    // Check domain blocklist
    if (this.blockedDomains.some((d) => senderDomain === d || senderDomain.endsWith(`.${d}`))) {
      return {
        action: "block",
        reason: `Blocked sender domain: ${senderDomain}`,
        message,
      };
    }

    // Check sender patterns
    for (const pattern of this.senderPatterns) {
      if (pattern.test(senderEmail)) {
        return {
          action: "block",
          reason: `Blocked sender pattern: ${pattern.source}`,
          message,
        };
      }
    }

    // Check subject patterns
    const subject = message.subject.toLowerCase();
    for (const pattern of this.subjectPatterns) {
      if (pattern.test(subject)) {
        return {
          action: "block",
          reason: `Blocked subject pattern: ${pattern.source}`,
          message,
        };
      }
    }

    return { action: "pass", message };
  }
}

function safeRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}
