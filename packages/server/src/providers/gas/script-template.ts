/**
 * Generates a complete Google Apps Script that acts as an email bridge.
 * The script is copy-pasted into script.google.com by the user.
 */
export function generateGasScript(secret: string): string {
  if (!/^[0-9a-f]+$/i.test(secret)) {
    throw new Error("Secret must be hex-encoded");
  }

  return `// ═══════════════════════════════════════════════════════════
// AgentCloak — Gmail Bridge (Google Apps Script)
// Paste this entire script into script.google.com
// Do NOT share this script — it contains your secret key.
// ═══════════════════════════════════════════════════════════

var SECRET = "${secret}";
var VERSION = 1;

// ── Entry points ──

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) {
      return jsonResponse({ ok: false, error: "Invalid secret" });
    }

    var action = body.action;
    var handlers = {
      ping: handlePing,
      search: handleSearch,
      getMessage: handleGetMessage,
      listThreads: handleListThreads,
      getThread: handleGetThread,
      createDraft: handleCreateDraft,
      listDrafts: handleListDrafts,
      listLabels: handleListLabels,
    };

    var handler = handlers[action];
    if (!handler) {
      return jsonResponse({ ok: false, error: "Unknown action: " + action });
    }

    var data = handler(body);
    return jsonResponse({ ok: true, data: data, version: VERSION });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err), version: VERSION });
  }
}

function doGet() {
  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}

// ── Handlers ──

function handlePing() {
  return { email: Session.getActiveUser().getEmail() };
}

function handleSearch(body) {
  var query = body.query || "in:inbox";
  var offset = body.offset || 0;
  var maxResults = Math.min(body.maxResults || 10, 50);

  var threads = GmailApp.search(query, offset, maxResults + 1);
  var hasMore = threads.length > maxResults;
  if (hasMore) threads = threads.slice(0, maxResults);

  var messages = [];
  for (var i = 0; i < threads.length; i++) {
    var msgs = threads[i].getMessages();
    var latest = msgs[msgs.length - 1];
    messages.push(formatMessage(latest, threads[i].getId()));
  }

  return {
    messages: messages,
    hasMore: hasMore,
    total: hasMore ? offset + messages.length + 1 : offset + messages.length,
  };
}

function handleGetMessage(body) {
  var msg = GmailApp.getMessageById(body.messageId);
  if (!msg) throw new Error("Message not found: " + body.messageId);
  return formatMessage(msg, msg.getThread().getId());
}

function handleListThreads(body) {
  var query = body.query || "in:inbox";
  var offset = body.offset || 0;
  var maxResults = Math.min(body.maxResults || 10, 50);

  var threads = GmailApp.search(query, offset, maxResults + 1);
  var hasMore = threads.length > maxResults;
  if (hasMore) threads = threads.slice(0, maxResults);

  var result = [];
  for (var i = 0; i < threads.length; i++) {
    result.push(formatThread(threads[i]));
  }

  return {
    threads: result,
    hasMore: hasMore,
    total: hasMore ? offset + result.length + 1 : offset + result.length,
  };
}

function handleGetThread(body) {
  var thread = GmailApp.getThreadById(body.threadId);
  if (!thread) throw new Error("Thread not found: " + body.threadId);

  var msgs = thread.getMessages();
  var messages = [];
  for (var i = 0; i < msgs.length; i++) {
    messages.push(formatMessage(msgs[i], thread.getId()));
  }

  return {
    thread: formatThread(thread),
    messages: messages,
  };
}

function handleCreateDraft(body) {
  if (!Array.isArray(body.to) || !body.subject || !body.body) {
    throw new Error("Missing required fields: to (array), subject, body");
  }

  var draft;
  if (body.inReplyToThreadId) {
    var thread = GmailApp.getThreadById(body.inReplyToThreadId);
    if (!thread) throw new Error("Thread not found: " + body.inReplyToThreadId);
    var msgs = thread.getMessages();
    var lastMsg = msgs[msgs.length - 1];
    draft = lastMsg.createDraftReply(body.body, {
      to: body.to.join(", "),
      subject: body.subject,
    });
  } else {
    draft = GmailApp.createDraft(body.to.join(", "), body.subject, body.body);
  }

  return {
    draftId: draft.getId(),
    messageId: draft.getMessageId(),
  };
}

function handleListDrafts(body) {
  var maxResults = body.maxResults || 10;
  var allDrafts = GmailApp.getDrafts();
  var drafts = allDrafts.slice(0, maxResults);

  var result = [];
  for (var i = 0; i < drafts.length; i++) {
    var msg = drafts[i].getMessage();
    result.push({
      id: drafts[i].getId(),
      messageId: msg.getId(),
      to: parseAddressList(msg.getTo()),
      subject: msg.getSubject(),
      snippet: msg.getPlainBody().substring(0, 200),
      updatedAt: msg.getDate().toISOString(),
    });
  }

  return { drafts: result };
}

function handleListLabels() {
  var labels = [];

  // System labels (not returned by getUserLabels)
  var systemLabels = [
    { id: "INBOX", name: "INBOX" },
    { id: "SENT", name: "SENT" },
    { id: "DRAFTS", name: "DRAFTS" },
    { id: "TRASH", name: "TRASH" },
    { id: "SPAM", name: "SPAM" },
    { id: "STARRED", name: "STARRED" },
    { id: "IMPORTANT", name: "IMPORTANT" },
    { id: "CATEGORY_SOCIAL", name: "CATEGORY_SOCIAL" },
    { id: "CATEGORY_PROMOTIONS", name: "CATEGORY_PROMOTIONS" },
    { id: "CATEGORY_UPDATES", name: "CATEGORY_UPDATES" },
    { id: "CATEGORY_FORUMS", name: "CATEGORY_FORUMS" },
  ];

  var inboxUnread = GmailApp.getInboxUnreadCount();
  var spamUnread = GmailApp.getSpamUnreadCount();

  for (var i = 0; i < systemLabels.length; i++) {
    var sl = systemLabels[i];
    var unread = 0;
    if (sl.id === "INBOX") unread = inboxUnread;
    if (sl.id === "SPAM") unread = spamUnread;
    labels.push({
      id: sl.id,
      name: sl.name,
      type: "system",
      messagesTotal: 0,
      messagesUnread: unread,
    });
  }

  // User labels
  var userLabels = GmailApp.getUserLabels();
  for (var j = 0; j < userLabels.length; j++) {
    var ul = userLabels[j];
    labels.push({
      id: ul.getName(),
      name: ul.getName(),
      type: "user",
      messagesTotal: 0,
      messagesUnread: ul.getUnreadCount(),
    });
  }

  return labels;
}

// ── Formatting helpers ──

function formatMessage(msg, threadId) {
  return {
    id: msg.getId(),
    threadId: threadId,
    subject: msg.getSubject(),
    from: parseAddress(msg.getFrom()),
    to: parseAddressList(msg.getTo()),
    cc: parseAddressList(msg.getCc() || ""),
    date: msg.getDate().toISOString(),
    snippet: msg.getPlainBody().substring(0, 200),
    body: msg.getPlainBody(),
    htmlBody: msg.getBody(),
    labels: msg.getThread().getLabels().map(function(l) { return l.getName(); }),
    attachments: msg.getAttachments().map(function(a) {
      return {
        filename: a.getName(),
        mimeType: a.getContentType(),
        size: a.getSize(),
      };
    }),
    isUnread: msg.isUnread(),
  };
}

function formatThread(thread) {
  var msgs = thread.getMessages();
  var participants = {};
  for (var i = 0; i < msgs.length; i++) {
    var from = parseAddress(msgs[i].getFrom());
    participants[from.email] = from;
    var toList = parseAddressList(msgs[i].getTo());
    for (var j = 0; j < toList.length; j++) {
      participants[toList[j].email] = toList[j];
    }
  }

  var lastMsg = msgs[msgs.length - 1];
  var labelNames = thread.getLabels().map(function(l) { return l.getName(); });

  return {
    id: thread.getId(),
    subject: thread.getFirstMessageSubject(),
    participants: Object.keys(participants).map(function(k) { return participants[k]; }),
    messageCount: msgs.length,
    snippet: lastMsg.getPlainBody().substring(0, 200),
    lastMessageDate: lastMsg.getDate().toISOString(),
    labels: labelNames,
    isUnread: thread.isUnread(),
  };
}

function parseAddress(raw) {
  if (!raw) return { name: "", email: "" };
  var match = raw.match(/^(.+?)\\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/^["']|["']$/g, "").trim(), email: match[2].trim() };
  }
  // Bare email
  return { name: "", email: raw.trim() };
}

function parseAddressList(raw) {
  if (!raw) return [];
  var parts = raw.split(",");
  var result = [];
  for (var i = 0; i < parts.length; i++) {
    var trimmed = parts[i].trim();
    if (trimmed) result.push(parseAddress(trimmed));
  }
  return result;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}
