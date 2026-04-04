import type { EmailMessage } from "../providers/types.js";
import type { EmailFilter, FilterResult } from "./types.js";

interface PiiPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

const PII_PATTERNS: PiiPattern[] = [
  // NOTE: Order matters! More specific labeled patterns (account numbers, routing
  // numbers) must come before the generic SSN pattern, because SSN matches any
  // 9-digit number and would otherwise consume labeled numbers first.
  {
    name: "Credit Card",
    // Visa (4xxx), Mastercard (51-55xx, 2221-2720), Amex (34/37xx), Discover (6011/65xx)
    pattern: /\b(?:4\d{3}|5[1-5]\d{2}|2[2-7]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[- .]?\d{4}[- .]?\d{4}[- .]?\d{3,4}\b/g,
    replacement: "[CREDIT_CARD_REDACTED]",
  },
  {
    name: "Account Number (ending in)",
    pattern: /(?:account|acct|card)(?:\s+(?:number|no|#))?\s*(?:ending|ending in|xxxx|\.{3,})\s*\d{4}/gi,
    replacement: "[ACCOUNT_REDACTED]",
  },
  {
    name: "Account Number (with label)",
    pattern: /(?:account|acct)(?:\s+(?:number|no|#))?[.:\s]+\d{6,}/gi,
    replacement: "[ACCOUNT_REDACTED]",
  },
  {
    name: "Routing Number",
    pattern: /(?:routing|aba|transit)\s*(?:number|no|#)?\s*:?\s*\d{9}\b/gi,
    replacement: "[ROUTING_NUMBER_REDACTED]",
  },
  {
    name: "SSN",
    // Supports dash, space, and no-separator formats
    pattern: /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g,
    replacement: "[SSN_REDACTED]",
  },
  {
    name: "Phone Number",
    // US phone formats: (xxx) xxx-xxxx, xxx-xxx-xxxx, +1 xxx xxx xxxx, etc.
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE_REDACTED]",
  },
  {
    name: "US Address",
    // Common US street address format with state and ZIP
    pattern: /\b\d{1,5}\s+\w+\s+(?:st|street|ave|avenue|blvd|boulevard|dr|drive|ln|lane|rd|road|ct|court|way|pl|place)\b[,.]?\s*\w+[,.]?\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/gi,
    replacement: "[ADDRESS_REDACTED]",
  },
  {
    name: "PEM Private Key",
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    replacement: "[PRIVATE_KEY_REDACTED]",
  },
  {
    name: "API Key (sk_)",
    pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
    replacement: "[API_KEY_REDACTED]",
  },
  {
    name: "API Key (pk_)",
    pattern: /\bpk_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
    replacement: "[API_KEY_REDACTED]",
  },
  {
    name: "API Key (generic)",
    pattern: /\b(?:api_key|apikey|api_secret|token)[=:]\s*["']?[A-Za-z0-9_\-]{20,}["']?/gi,
    replacement: "[API_KEY_REDACTED]",
  },
  {
    name: "AWS Access Key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "[AWS_KEY_REDACTED]",
  },
  {
    name: "AWS Secret Key",
    pattern: /\b[A-Za-z0-9/+=]{40}\b(?=.*(?:aws|secret|key))/gi,
    replacement: "[AWS_SECRET_REDACTED]",
  },
  {
    name: "Bearer Token",
    pattern: /Bearer\s+[A-Za-z0-9_\-\.]{20,}/g,
    replacement: "Bearer [TOKEN_REDACTED]",
  },
];

const DOLLAR_AMOUNT_PATTERN: PiiPattern = {
  name: "Dollar Amount",
  // Matches $X.XX, $XX.XX, $X,XXX.XX, etc. (any amount with cents)
  pattern: /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/g,
  replacement: "[AMOUNT_REDACTED]",
};

const EMAIL_ADDRESS_PATTERN: PiiPattern = {
  name: "Email Address",
  pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  replacement: "[EMAIL_REDACTED]",
};

export class PiiFilter implements EmailFilter {
  name = "pii";
  private enabled: boolean;
  private emailRedactionEnabled: boolean;
  private dollarAmountRedactionEnabled: boolean;

  constructor(enabled = true, emailRedactionEnabled = true, dollarAmountRedactionEnabled = true) {
    this.enabled = enabled;
    this.emailRedactionEnabled = emailRedactionEnabled;
    this.dollarAmountRedactionEnabled = dollarAmountRedactionEnabled;
  }

  filter(message: EmailMessage): FilterResult {
    if (!this.enabled) {
      return { action: "pass", message };
    }

    const sanitized = { ...message };
    let wasRedacted = false;

    const redact = (text: string) =>
      redactPii(text, this.emailRedactionEnabled, this.dollarAmountRedactionEnabled);
    sanitized.body = redact(sanitized.body);
    sanitized.subject = redact(sanitized.subject);
    sanitized.snippet = redact(sanitized.snippet);

    // Redact PII from address name fields
    if (sanitized.from.name) {
      sanitized.from = { ...sanitized.from, name: redact(sanitized.from.name) };
    }
    sanitized.to = sanitized.to.map((addr) => ({
      ...addr,
      name: addr.name ? redact(addr.name) : addr.name,
    }));
    if (sanitized.cc) {
      sanitized.cc = sanitized.cc.map((addr) => ({
        ...addr,
        name: addr.name ? redact(addr.name) : addr.name,
      }));
    }

    if (
      sanitized.body !== message.body ||
      sanitized.subject !== message.subject ||
      sanitized.snippet !== message.snippet
    ) {
      wasRedacted = true;
    }

    return {
      action: wasRedacted ? "redact" : "pass",
      reason: wasRedacted ? "PII patterns redacted" : undefined,
      message: sanitized,
    };
  }
}

function redactPii(text: string, emailRedaction: boolean, dollarAmountRedaction: boolean): string {
  let result = text;
  const patterns: PiiPattern[] = [...PII_PATTERNS];
  if (dollarAmountRedaction) {
    patterns.push(DOLLAR_AMOUNT_PATTERN);
  }
  if (emailRedaction) {
    patterns.push(EMAIL_ADDRESS_PATTERN);
  }
  for (const { pattern, replacement } of patterns) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}
