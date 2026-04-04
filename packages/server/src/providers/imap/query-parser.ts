import type { SearchObject } from "imapflow";

/** Aliases that users may type in `in:` queries, mapped to canonical logical names. */
const FOLDER_ALIASES: Record<string, string> = {
  inbox: "inbox",
  sent: "sent",
  trash: "trash",
  drafts: "drafts",
  draft: "drafts",
  spam: "junk",
  junk: "junk",
  starred: "flagged",
  flagged: "flagged",
  archive: "archive",
  all: "all",
};

export interface ParsedQuery {
  criteria: SearchObject;
  /** Logical folder name (e.g. "inbox", "sent") or a literal folder path if unrecognized. */
  folder: string;
}

/**
 * Converts a Gmail-style query string into ImapFlow search criteria and a target folder.
 *
 * Supported operators:
 *   from:X, to:X, subject:X, is:unread, is:read,
 *   after:YYYY/MM/DD, before:YYYY/MM/DD, in:folder
 *
 * Unrecognized text falls back to a subject search.
 */
export function parseGmailQuery(query: string): ParsedQuery {
  let folder = "inbox";
  const criteria: SearchObject = {};
  const textParts: string[] = [];

  // Tokenize — respect quoted strings
  const tokens = tokenize(query);

  for (const token of tokens) {
    const colonIdx = token.indexOf(":");
    if (colonIdx === -1) {
      textParts.push(token);
      continue;
    }

    const operator = token.slice(0, colonIdx).toLowerCase();
    const value = token.slice(colonIdx + 1).replace(/^["']|["']$/g, "");

    switch (operator) {
      case "from":
        criteria.from = value;
        break;
      case "to":
        criteria.to = value;
        break;
      case "subject":
        criteria.subject = value;
        break;
      case "is":
        if (value === "unread") {
          criteria.seen = false;
        } else if (value === "read") {
          criteria.seen = true;
        } else if (value === "starred" || value === "flagged") {
          criteria.flagged = true;
        }
        break;
      case "after": {
        const since = parseDate(value);
        if (since) criteria.since = since;
        break;
      }
      case "before": {
        const before = parseDate(value);
        if (before) criteria.before = before;
        break;
      }
      case "in":
      case "label": {
        const canonical = FOLDER_ALIASES[value.toLowerCase()];
        // If recognized, use logical name; otherwise pass through as literal path
        folder = canonical ?? value;
        break;
      }
      default:
        // Unknown operator — treat as text
        textParts.push(token);
        break;
    }
  }

  // Remaining text → subject search (best-effort)
  if (textParts.length > 0) {
    const text = textParts.join(" ").trim();
    if (text) {
      criteria.subject = criteria.subject
        ? `${criteria.subject} ${text}`
        : text;
    }
  }

  return { criteria, folder };
}

function tokenize(query: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const ch of query) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === " ") {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }

  if (current) tokens.push(current);
  return tokens;
}

function parseDate(value: string): Date | undefined {
  // Accept YYYY/MM/DD or YYYY-MM-DD
  const normalized = value.replace(/\//g, "-");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
