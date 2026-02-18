# AgentCloak

An open-source proxy service that sits between AI agents and your email. AgentCloak holds OAuth tokens and IMAP credentials server-side, filters sensitive content, redacts PII and email addresses, and sanitizes for prompt injection — so agents can safely triage, summarize, and draft emails without seeing things they shouldn't.

## Key Safety Features

- **Read-only by design** — Agents can search, read, and create drafts. They cannot send, delete, trash, or modify any emails.
- **Sensitive email blocking** — Emails from financial institutions, security senders, and government agencies are blocked before the agent ever sees them. Blocking is split into independently toggleable categories: security emails (password resets, 2FA codes, login alerts), financial emails (bank statements, payments, tax docs), and sensitive senders (security@, fraud@, .gov addresses). 40+ domains, 13 sender patterns, and 50+ subject patterns are included by default.
- **PII redaction** — SSNs, credit card numbers, account numbers, routing numbers, API keys, and large dollar amounts are replaced with `[REDACTED]` placeholders. Dollar amount redaction can be toggled independently.
- **Email address redaction** — Email addresses are stripped from all structured fields (`from`, `to`, `cc`, `participants`) and replaced with display names only. Addresses in email body text are redacted as `[EMAIL_REDACTED]`. This prevents agents from exfiltrating contact information to external systems.
- **Attachment filtering** — Attachment metadata (filenames, types, sizes) can be hidden from agents entirely, preventing them from referencing or requesting access to sensitive files.
- **Folder restriction** — Restrict agent access to specific folders (e.g. INBOX only). Messages outside allowed folders are blocked, and restricted folder names are hidden from label listings.
- **Thread reply auto-population** — When an agent creates a draft reply to a thread, recipients are auto-populated server-side from the thread's participants. The agent never needs to see or handle email addresses.
- **HTML & Unicode sanitization** — HTML is converted to plaintext. Dangerous Unicode characters (zero-width chars, bidi overrides, tag characters) that could be used for prompt injection are stripped.
- **Prompt injection detection** — Known injection patterns in email content are detected and flagged with warnings.
- **Credentials stay server-side** — Agents authenticate with API keys. Gmail OAuth tokens and IMAP credentials are stored in encrypted SQLite and never exposed through the MCP interface.
- **Web dashboard** — All filter settings, API keys, and connections are managed through a browser-based dashboard. Agents cannot access or modify these settings.

## How It Works

```
AI Agent (Claude Code, OpenClaw, any MCP client)
  │
  │  MCP Streamable HTTP + API key
  ▼
AgentCloak Server
  ├── 7 MCP tools (search, read, threads, drafts, labels)
  ├── Content filter pipeline (blocklist → sanitizer → PII → injection)
  ├── Attachment filtering & folder restriction
  ├── Email address redaction (structured fields + body text)
  ├── Gmail provider (OAuth2, token refresh)
  ├── IMAP provider (encrypted credentials)
  ├── Web dashboard (React + Tailwind)
  └── SQLite storage (tokens, API keys, filter configs)
```

Agents connect via MCP over HTTP with an API key. Every email passes through a four-stage filter pipeline before reaching the agent:

1. **Folder restriction** — If allowed folders are configured, messages outside those folders are blocked before any other processing.
2. **Blocklist** — Blocks emails from financial institutions, government agencies, and security senders. Each category (security, financial, sensitive sender) can be toggled independently. Custom blocked domains and subject patterns are always applied.
3. **Sanitizer** — Converts HTML to plaintext, strips dangerous Unicode (zero-width chars, bidi overrides, tag characters).
4. **PII Redaction** — Replaces SSNs, credit card numbers, account numbers, API keys, and email addresses with `[REDACTED]` placeholders. Dollar amount redaction is independently toggleable.
5. **Injection Detection** — Detects prompt injection patterns in email content and prepends warnings (does not block).
6. **Attachment filtering** — When enabled, strips attachment metadata from the output so agents cannot see filenames, types, or sizes.

In addition to body-level filtering, all structured fields (`from`, `to`, `cc`, `participants`) are processed to show display names only — email addresses are never returned to the agent.

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_emails` | Search by query, returns filtered summaries |
| `read_email` | Read full email content (sanitized) |
| `list_threads` | List threads matching a query |
| `get_thread` | Get all messages in a thread (each sanitized) |
| `create_draft` | Create a draft (not sent — user must review). Thread replies auto-populate recipients server-side. |
| `list_drafts` | List existing drafts |
| `list_labels` | List labels with unread counts (respects folder restrictions) |

## Project Structure

```
agentcloak/
├── packages/
│   ├── server/          # Core proxy server (Hono + MCP SDK)
│   ├── web/             # Web dashboard (React + Tailwind + Vite)
│   ├── cli/             # CLI for setup, key management, filters
│   └── mcp-stdio/       # Stdio proxy for stdio-only environments
└── deploy/
    ├── docker/          # Docker deployment
    └── cloudflare/      # Cloudflare Workers (planned)
```

## Quick Start

### Prerequisites

- **Node.js 20+** and **pnpm 10+**
- **IMAP credentials** (optional) — If connecting a non-Gmail account, you'll need the IMAP host, port, and an app-specific password from your email provider.

### 1. Install

```bash
git clone https://github.com/yourusername/agentcloak.git
cd agentcloak
pnpm install
```

### 2. Set up Google OAuth

Google OAuth is required for signing in to the dashboard (even if you only plan to use IMAP email accounts).

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Gmail API** under APIs & Services > Library
4. Go to **APIs & Services > Credentials** and create an **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3000/auth/callback` (check port your server runs on)
5. Copy the **Client ID** and **Client Secret** for the next step

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your Google OAuth credentials and a session secret:

```bash
# Required — random string, 32+ characters (used for session cookies)
SESSION_SECRET=change-me-to-a-random-string-at-least-32-chars

# Required — Google OAuth credentials from step 2
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Server
BASE_URL=http://localhost:3000
PORT=3000
```

### 4. Build and start the server

```bash
pnpm build   # builds all packages (server, web dashboard, CLI, stdio bridge)
pnpm dev     # starts the server on http://localhost:3000
```

The SQLite database is created automatically at `data/agentcloak.db` on first run. The server serves both the API and the web dashboard from the same process.

### 5. Sign in to the dashboard

Open **http://localhost:3000** and click **"Sign in with Google"**. This creates your account and starts a session. The dashboard is where you manage everything — connections, API keys, and filters.

### 6. Connect an email account

From the **Connections** page:

- **Gmail** — Click "Connect Gmail". You'll authorize read-only access through Google OAuth. AgentCloak stores the OAuth tokens server-side.
- **IMAP** — Click "Add IMAP Account". Enter your server details (host, port, username, app password). You can test the connection before saving. Credentials are encrypted and stored in SQLite.

### 7. Create an API key

Click into your connection, then click **"Create Key"** in the API Keys section. Copy the key immediately — it's only shown once. Keys are prefixed with `ac_`.

### 8. Configure content filters

Scroll down on the connection detail page to **Content Filters**. All filters are enabled by default. You can:

- Toggle blocking categories independently (security, financial, sensitive senders)
- Toggle PII redaction, email address redaction, dollar amount redaction
- Enable/disable attachment filtering and prompt injection detection
- Add custom blocked domains and subject keywords
- Restrict agent access to specific folders

Click the info icon next to any filter for a detailed explanation of what it does.

### 9. Connect your AI agent

**Claude Code:**

```bash
claude mcp add --transport http agentcloak http://localhost:3000/mcp \
  --header "Authorization: Bearer ac_your_key_here"
```

**Other MCP clients:**

Any MCP client that supports Streamable HTTP transport can connect to `http://localhost:3000/mcp` with the header `Authorization: Bearer ac_...`.

For stdio-only clients (that don't support HTTP transport), use the `@agentcloak/mcp-stdio` package as a bridge.

## Filter Configuration

Filters are configurable per connection through the web dashboard. All settings are stored server-side in SQLite — agents cannot access or modify them. Each toggle includes an info icon with a detailed explanation of what it does.

**Default blocklists (split into toggleable categories):**
- **40+ financial domains** — Banks, brokerages, payment processors, mortgage servicers (toggle: Financial Email Blocking)
- **13 sensitive sender patterns** — security-noreply@, alerts@, fraud@, .gov addresses, etc. (toggle: Sensitive Sender Blocking)
- **34 security subject patterns** — Password resets, 2FA codes, verification emails, login alerts (toggle: Security Email Blocking)
- **24 financial subject patterns** — Bank statements, payment confirmations, tax documents (toggle: Financial Email Blocking)

**Configurable settings:**

| Setting | Default | Description |
|---------|---------|-------------|
| PII Redaction | Enabled | Redact SSNs, credit cards, account numbers, API keys, etc. |
| Email Address Redaction | Enabled | Strip email addresses from all agent-visible responses |
| Injection Detection | Enabled | Flag prompt injection patterns in email content |
| Show Filtered Count | Enabled | Tell agents how many emails were filtered out |
| Security Email Blocking | Enabled | Block password resets, 2FA codes, verification emails, login alerts |
| Financial Email Blocking | Enabled | Block bank statements, payment confirmations, tax documents, financial domains |
| Sensitive Sender Blocking | Enabled | Block emails from security/verification sender addresses |
| Dollar Amount Redaction | Enabled | Redact large dollar amounts ($X,XXX.XX) separately from other PII |
| Attachment Filtering | Enabled | Hide attachment metadata from agents |

**Custom rules (managed via dashboard):**
- **Custom Blocked Domains** — Add sender domains to block (e.g. marketing.example.com)
- **Custom Blocked Subject Keywords** — Add subject line patterns to block (supports regex)
- **Allowed Folders** — Restrict agent access to specific folders (leave empty to allow all)

Custom rules can also be managed via the CLI:

```bash
agentcloak filters add-domain example.com --user-id <your-id>
agentcloak filters add-subject "confidential" --user-id <your-id>
```

## Current Limitations

- **No attachment content access.** Attachment metadata (filename, type, size) is available when attachment filtering is disabled, but actual file content is not accessible. This is a security-conscious default — attachments like PDFs and images could contain sensitive information that bypasses text-based filters.
- **No send capability.** Agents can create drafts but cannot send emails. This is intentional.
- **Single-user per API key.** Each API key maps to one email connection.
- **Regex-based PII detection.** PII redaction uses pattern matching, not ML. Some formats may be missed.

## Future Enhancements

- **Attachment content reading** — Add a `read_attachment` tool that extracts text from PDFs and other documents, run through the filter pipeline before returning to the agent.
- **Outlook provider** — Extend beyond Gmail and IMAP with native Outlook/Microsoft Graph support.
- **ML-based injection detection** — Pluggable classifier for more sophisticated prompt injection detection.
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

8. **Multi-account aggregation** — Unified view across work + personal Gmail, or Gmail + IMAP, with per-account filter rules.

9. **Real-time notifications** — Gmail Pub/Sub push notifications instead of polling. Enables alerts like "notify me immediately if I get an email from Meta."

10. **Persistent memory across sessions** — Track trends over time ("last week you had 12 recruiter emails, this week you have 8") by storing summaries or metadata in a local index.

11. **Calendar integration** — Read calendar invites from email and create/modify Google Calendar events directly.

## Tech Stack

- **Hono** — HTTP framework (portable across Node, Workers, Deno, Bun)
- **MCP SDK** — Model Context Protocol server (Streamable HTTP transport)
- **React + Tailwind CSS + Vite** — Web dashboard
- **googleapis** — Gmail API client
- **ImapFlow** — IMAP client
- **better-sqlite3** — SQLite storage
- **Zod** — Schema validation for MCP tool inputs
- **html-to-text** — HTML to plaintext conversion
- **lucide-react** — Icon library

## License

MIT
