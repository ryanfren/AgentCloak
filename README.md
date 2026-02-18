# AgentCloak

An open-source proxy service that sits between AI agents and your email. AgentCloak holds OAuth tokens server-side, filters sensitive content, redacts PII and email addresses, and sanitizes for prompt injection — so agents can safely triage, summarize, and draft emails without seeing things they shouldn't.

## Key Safety Features

- **Read-only by design** — Agents can search, read, and create drafts. They cannot send, delete, trash, or modify any emails.
- **Sensitive email blocking** — Emails from financial institutions, security senders, and government agencies are blocked before the agent ever sees them. Subject-line patterns catch password resets, 2FA codes, bank statements, and more (40 domains, 13 sender patterns, 50+ subject patterns).
- **PII redaction** — SSNs, credit card numbers, account numbers, routing numbers, API keys, and large dollar amounts are replaced with `[REDACTED]` placeholders.
- **Email address redaction** — Email addresses are stripped from all structured fields (`from`, `to`, `cc`, `participants`) and replaced with display names only. Addresses in email body text are redacted as `[EMAIL_REDACTED]`. This prevents agents from exfiltrating contact information to external systems.
- **Thread reply auto-population** — When an agent creates a draft reply to a thread, recipients are auto-populated server-side from the thread's participants. The agent never needs to see or handle email addresses.
- **HTML & Unicode sanitization** — HTML is converted to plaintext. Dangerous Unicode characters (zero-width chars, bidi overrides, tag characters) that could be used for prompt injection are stripped.
- **Prompt injection detection** — Known injection patterns in email content are detected and flagged with warnings.
- **OAuth tokens stay server-side** — Agents authenticate with API keys. Gmail OAuth tokens are stored in SQLite and never exposed through the MCP interface.
- **Configurable per user** — All filter settings (blocklists, PII redaction, email address redaction, injection detection) are stored server-side where agents cannot access or modify them.

## How It Works

```
AI Agent (Claude Code, OpenClaw, any MCP client)
  │
  │  MCP Streamable HTTP + API key
  ▼
AgentCloak Server
  ├── 7 MCP tools (search, read, threads, drafts, labels)
  ├── Content filter pipeline (blocklist → sanitizer → PII → injection)
  ├── Email address redaction (structured fields + body text)
  ├── Gmail provider (OAuth2, token refresh)
  └── SQLite storage (tokens, API keys, filter configs)
```

Agents connect via MCP over HTTP with an API key. Every email passes through a four-stage filter pipeline before reaching the agent:

1. **Blocklist** — Blocks emails from financial institutions, government agencies, and security senders. Blocks subjects containing password resets, verification codes, bank statements, etc.
2. **Sanitizer** — Converts HTML to plaintext, strips dangerous Unicode (zero-width chars, bidi overrides, tag characters).
3. **PII Redaction** — Replaces SSNs, credit card numbers, account numbers, API keys, large dollar amounts, and email addresses with `[REDACTED]` placeholders.
4. **Injection Detection** — Detects prompt injection patterns in email content and prepends warnings (does not block).

In addition to body-level filtering, all structured fields (`from`, `to`, `cc`, `participants`) are processed to show display names only — email addresses are never returned to the agent.

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_emails` | Search by Gmail query, returns filtered summaries |
| `read_email` | Read full email content (sanitized) |
| `list_threads` | List threads matching a query |
| `get_thread` | Get all messages in a thread (each sanitized) |
| `create_draft` | Create a draft (not sent — user must review). Thread replies auto-populate recipients server-side. |
| `list_drafts` | List existing drafts |
| `list_labels` | List Gmail labels with unread counts |

## Project Structure

```
agentcloak/
├── packages/
│   ├── server/          # Core proxy server (Hono + MCP SDK)
│   ├── cli/             # CLI for setup, key management, filters
│   └── mcp-stdio/       # Stdio proxy for stdio-only environments
└── deploy/
    ├── docker/          # Docker deployment
    └── cloudflare/      # Cloudflare Workers (planned)
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 10+
- A Google Cloud project with Gmail API enabled and OAuth 2.0 credentials

### Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your Google OAuth credentials:
#   GOOGLE_CLIENT_ID=...
#   GOOGLE_CLIENT_SECRET=...
#   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
#   BASE_URL=http://localhost:3000

# Start the server (SQLite database auto-creates on first run at data/agentcloak.db)
pnpm dev

# Connect your Gmail account
open http://localhost:3000/auth/gmail?user_id=<your-id>

# Generate an API key
pnpm --filter @agentcloak/cli start -- keys create "my-key" --user-id <your-id>
```

### Connect to Claude Code

```bash
claude mcp add --transport http agentcloak http://localhost:3000/mcp \
  --header "Authorization: Bearer ac_your_key_here"
```

### Connect to other MCP clients

Any MCP client that supports Streamable HTTP transport can connect by pointing to `http://localhost:3000/mcp` with the `Authorization: Bearer ac_...` header.

For stdio-only clients, use the `@agentcloak/mcp-stdio` package as a bridge.

## Filter Configuration

Filters are configurable per user. All settings are stored server-side in SQLite — agents cannot access or modify them.

**Default blocklists:**
- **40 financial domains** (banks, brokerages, payment processors, mortgage servicers)
- **13 sender patterns** (security-noreply@, alerts@, fraud@, etc.)
- **50+ subject patterns** (password reset, verification code, bank statement, payment confirmation, etc.)

**Configurable settings:**
| Setting | Default | Description |
|---------|---------|-------------|
| Email address redaction | Enabled | Strip email addresses from all agent-visible responses |
| PII redaction | Enabled | Redact SSNs, credit cards, account numbers, etc. |
| Injection detection | Enabled | Flag prompt injection patterns in email content |
| Show filtered count | Enabled | Tell agents how many emails were filtered out |

Add custom filters via the CLI:

```bash
agentcloak filters add-domain example.com --user-id <your-id>
agentcloak filters add-subject "confidential" --user-id <your-id>
```

## Current Limitations

- **No attachment content access.** Attachment metadata (filename, type, size) is returned, but the actual file content is not accessible. This is a security-conscious default — attachments like PDFs and images could contain sensitive information that bypasses text-based filters.
- **Gmail only.** Outlook, IMAP, and other providers are not yet supported.
- **No send capability.** Agents can create drafts but cannot send emails. This is intentional.
- **Single-user per API key.** Each API key maps to one Gmail account.
- **Regex-based PII detection.** PII redaction uses pattern matching, not ML. Some formats may be missed.
- **No dashboard UI.** Filter and key management is CLI-only for now.

## Future Enhancements

- **Attachment content reading** — Add a `read_attachment` tool that extracts text from PDFs and other documents, run through the filter pipeline before returning to the agent.
- **Outlook / IMAP providers** — Extend beyond Gmail.
- **ML-based injection detection** — Pluggable classifier for more sophisticated prompt injection detection.
- **Web dashboard** — Browser-based UI for managing filters, API keys, and connected accounts.
- **Cloudflare Workers deployment** — Edge deployment with D1 storage.
- **Audit logging** — Log what agents access for compliance and debugging.

## Use Cases

### What You Can Do Today

**Daily workflow**
- **Email triage & prioritization** — "What's important today?" with intelligent ranking across your inbox
- **Follow-up detection** — Cross-reference sent emails against replies to find dropped threads and unanswered messages
- **Draft replies** — Read context, compose a contextual reply, save as draft for your review
- **Thread summarization** — Collapse a 20-message thread into key points and action items

**Research & prep**
- **Meeting prep** — Pull everything from a specific sender or domain before a call to summarize the relationship history
- **Job search dashboard** — Track applications, recruiter outreach, and interview stages across companies
- **Vendor/tenant communication review** — Summarize all correspondence with a property manager, contractor, or business contact over a period

**Analysis**
- **Newsletter digest** — Summarize key stories across multiple newsletter emails instead of reading each one individually
- **Subscription audit** — Find all promotional senders to decide what to unsubscribe from
- **Email patterns** — Identify who emails you the most, label distribution, unread counts by category

**Drafting at scale**
- **Batch draft replies** — Draft a short reply to every unanswered recruiter message from the past week
- **Templated responses** — Generate polite declines, thank-you notes, or follow-ups from a single prompt

### Potential Future Use Cases (require enhancements)

**High value, moderate effort:**

1. **Attachment reading** — Unlocks invoice processing, contract review, reading forwarded PDFs. Probably the single biggest capability gap. Requires a `read_attachment` tool with PDF/document text extraction run through the filter pipeline.

2. **Email organization** — Labeling, archiving, starring, marking read/unread. Right now the agent can tell you what to do but can't actually clean up your inbox. Adding `modify_labels` and `archive` tools with confirmation would enable inbox-zero workflows.

3. **Scheduled digests** — "Every morning at 7am, summarize overnight emails and send me a Slack message." Requires a scheduler (cron) and an outbound integration. Turns AgentCloak from reactive to proactive.

4. **Semantic search** — Gmail's query syntax is powerful but literal. Natural language queries like "find that email where someone mentioned pushing the deadline back" would require indexing emails into a vector store.

**Medium value, lower effort:**

5. **Link extraction & preview** — Fetch and summarize URLs found in emails (linked articles, job postings, documents) to add context without leaving the conversation.

6. **Contact enrichment** — Integrate with Google Contacts to automatically know who senders are and their relationship context.

7. **Forwarding as draft** — Create forward drafts with original content included, not just new emails and replies.

**High value, higher effort:**

8. **Multi-account aggregation** — Unified view across work + personal Gmail, or Gmail + Outlook, with per-account filter rules.

9. **Real-time notifications** — Gmail Pub/Sub push notifications instead of polling. Enables alerts like "notify me immediately if I get an email from Meta."

10. **Persistent memory across sessions** — Track trends over time ("last week you had 12 recruiter emails, this week you have 8") by storing summaries or metadata in a local index.

11. **Calendar integration** — Read calendar invites from email and create/modify Google Calendar events directly.

## Tech Stack

- **Hono** — HTTP framework (portable across Node, Workers, Deno, Bun)
- **MCP SDK** — Model Context Protocol server (Streamable HTTP transport)
- **googleapis** — Gmail API client
- **better-sqlite3** — SQLite storage
- **Zod** — Schema validation for MCP tool inputs
- **html-to-text** — HTML to plaintext conversion

## License

MIT
