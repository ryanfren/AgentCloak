import type { gmail_v1 } from "googleapis";
import type { EmailAddress, EmailAttachmentMeta, EmailMessage } from "../types.js";

export function parseGmailMessage(
  msg: gmail_v1.Schema$Message,
): EmailMessage {
  const headers = msg.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  const { text, html } = extractBody(msg.payload ?? {});
  const attachments = extractAttachments(msg.payload ?? {});

  return {
    id: msg.id!,
    threadId: msg.threadId!,
    subject: getHeader("Subject"),
    from: parseEmailAddress(getHeader("From")),
    to: parseEmailAddressList(getHeader("To")),
    cc: parseEmailAddressList(getHeader("Cc")),
    date: getHeader("Date"),
    snippet: msg.snippet ?? "",
    body: text,
    htmlBody: html || undefined,
    labels: msg.labelIds ?? [],
    attachments,
    isUnread: msg.labelIds?.includes("UNREAD") ?? false,
  };
}

function extractBody(
  part: gmail_v1.Schema$MessagePart,
): { text: string; html: string } {
  let text = "";
  let html = "";

  if (part.mimeType === "text/plain" && part.body?.data) {
    text = decodeBase64Url(part.body.data);
  } else if (part.mimeType === "text/html" && part.body?.data) {
    html = decodeBase64Url(part.body.data);
  }

  if (part.parts) {
    for (const child of part.parts) {
      const childResult = extractBody(child);
      if (childResult.text && !text) text = childResult.text;
      if (childResult.html && !html) html = childResult.html;
    }
  }

  return { text, html };
}

function extractAttachments(
  part: gmail_v1.Schema$MessagePart,
): EmailAttachmentMeta[] {
  const attachments: EmailAttachmentMeta[] = [];

  if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
    attachments.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
    });
  }

  if (part.parts) {
    for (const child of part.parts) {
      attachments.push(...extractAttachments(child));
    }
  }

  return attachments;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

export function parseEmailAddress(raw: string): EmailAddress {
  const match = raw.match(/^(?:"?(.+?)"?\s+)?<?([^\s<>]+@[^\s<>]+)>?$/);
  if (match) {
    return { name: match[1]?.trim() ?? "", email: match[2] };
  }
  return { name: "", email: raw.trim() };
}

function parseEmailAddressList(raw: string): EmailAddress[] {
  if (!raw) return [];
  return raw.split(",").map((s) => parseEmailAddress(s.trim()));
}
