import { createHash } from "node:crypto";
import type { ParsedMail, AddressObject } from "mailparser";
import { convert } from "html-to-text";
import type {
  EmailAddress,
  EmailAttachmentMeta,
  EmailMessage,
} from "../types.js";

/**
 * Converts a parsed IMAP message into our EmailMessage format.
 * @param parsed - Output of `simpleParser()` from mailparser
 * @param uid - IMAP UID of the message
 * @param folder - IMAP folder the message was fetched from
 * @param flags - IMAP flags on the message
 */
export function parseImapMessage(
  parsed: ParsedMail,
  uid: number,
  folder: string,
  flags: Set<string>,
): EmailMessage {
  const from = extractAddresses(parsed.from);
  const to = extractAddresses(parsed.to);
  const cc = extractAddresses(parsed.cc);

  const htmlBody = parsed.html ? parsed.html : undefined;
  let textBody = parsed.text ?? "";
  if (!textBody && htmlBody) {
    textBody = convert(htmlBody, { wordwrap: false });
  }

  // Build thread ID from References/In-Reply-To headers
  const threadId = buildThreadId(parsed);

  const attachments: EmailAttachmentMeta[] = (parsed.attachments ?? []).map(
    (att) => ({
      filename: att.filename ?? "unnamed",
      mimeType: att.contentType ?? "application/octet-stream",
      size: att.size ?? 0,
    }),
  );

  const snippet = textBody.slice(0, 200).replace(/\s+/g, " ").trim();

  return {
    id: `${folder}:${uid}`,
    threadId,
    subject: parsed.subject ?? "(no subject)",
    from: from[0] ?? { name: "", email: "" },
    to,
    cc,
    date: parsed.date?.toISOString() ?? new Date().toISOString(),
    snippet,
    body: textBody,
    htmlBody,
    labels: [folder],
    attachments,
    isUnread: !flags.has("\\Seen"),
  };
}

/**
 * Derives a thread ID from the message's References chain or In-Reply-To header.
 * Falls back to normalized subject.
 */
export function buildThreadId(parsed: ParsedMail): string {
  // The first Message-ID in References is the thread root
  const references = parsed.references;
  if (references && references.length > 0) {
    return hashString(references[0]);
  }

  // Fall back to In-Reply-To
  const inReplyTo = parsed.inReplyTo;
  if (inReplyTo) {
    return hashString(inReplyTo);
  }

  // Fall back to the message's own Message-ID
  if (parsed.messageId) {
    return hashString(parsed.messageId);
  }

  // Last resort: normalized subject
  return hashString(normalizeSubject(parsed.subject ?? ""));
}

export function normalizeSubject(subject: string): string {
  let prev = "";
  let result = subject;
  // Recursively strip reply/forward prefixes (including non-English variants)
  while (result !== prev) {
    prev = result;
    result = result.replace(/^(Re|Fwd|Fw|AW|SV|TR|Rif)\s*:\s*/i, "");
  }
  return result.trim().toLowerCase();
}

function hashString(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 16);
  return `imap-thread-${hex}`;
}

function extractAddresses(
  addr: AddressObject | AddressObject[] | undefined,
): EmailAddress[] {
  if (!addr) return [];
  const list = Array.isArray(addr) ? addr : [addr];
  const result: EmailAddress[] = [];
  for (const group of list) {
    for (const a of group.value) {
      result.push({
        name: a.name ?? "",
        email: a.address ?? "",
      });
    }
  }
  return result;
}
