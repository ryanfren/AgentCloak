import { convert } from "html-to-text";
import type { EmailMessage } from "../providers/types.js";
import type { EmailFilter, FilterResult } from "./types.js";

// Unicode ranges to strip
const UNICODE_STRIP_RANGES = [
  /[\u200B-\u200D]/g, // Zero-width chars (ZWSP, ZWNJ, ZWJ)
  /\u2060/g, // Word joiner
  /\uFEFF/g, // BOM / zero-width no-break space
  /[\u2066-\u2069]/g, // Bidi isolates
  /[\u202A-\u202E]/g, // Bidi overrides
  /[\u{E0001}-\u{E007F}]/gu, // Tag characters
  /[\uFE00-\uFE0F]/g, // Variation selectors
  /\u00AD/g, // Soft hyphen
  /[\u2028-\u2029]/g, // Line/paragraph separator
  /\u061C/g, // Arabic letter mark
  /\u180E/g, // Mongolian vowel separator
];

export class SanitizerFilter implements EmailFilter {
  name = "sanitizer";

  filter(message: EmailMessage): FilterResult {
    const sanitized = { ...message };

    // Convert HTML to plaintext if we have HTML
    if (sanitized.htmlBody) {
      const converted = convert(sanitized.htmlBody, {
        wordwrap: 120,
        selectors: [
          { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
          { selector: "img", format: "skip" },
          { selector: "style", format: "skip" },
          { selector: "script", format: "skip" },
        ],
      });

      // Use HTML-converted text if we have no plaintext body
      if (!sanitized.body) {
        sanitized.body = converted;
      }
    }

    // Remove htmlBody so agent never sees raw HTML
    delete sanitized.htmlBody;

    // Strip dangerous Unicode
    sanitized.body = stripUnicode(sanitized.body);
    sanitized.subject = stripUnicode(sanitized.subject);
    sanitized.snippet = stripUnicode(sanitized.snippet);

    return { action: "pass", message: sanitized };
  }
}

function stripUnicode(text: string): string {
  let result = text;
  for (const pattern of UNICODE_STRIP_RANGES) {
    result = result.replace(pattern, "");
  }
  return result;
}
