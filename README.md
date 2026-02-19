# AgentCloak

An open-source proxy service that sits between AI agents and your email. AgentCloak holds OAuth tokens, IMAP credentials, and Apps Script secrets server-side, filters sensitive content, redacts PII and email addresses, and sanitizes for prompt injection — so agents can safely triage, summarize, and draft emails without seeing things they shouldn't.

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
- **Credentials stay server-side** — Agents authenticate with API keys. Gmail OAuth tokens, IMAP credentials, and Apps Script secrets are encrypted at rest in SQLite and never exposed through the MCP interface.
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
  ├── Apps Script provider (no Google Cloud project needed)
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
│   ├── cli/             # CLI for setup, key management, filters, password reset
│   └── mcp-stdio/       # Stdio proxy for stdio-only environments
└── deploy/
    ├── docker/          # Docker deployment
    └── cloudflare/      # Cloudflare Workers (planned)
```

## Quick Start

### Prerequisites

- **Node.js 20+** and **pnpm 10+**
- **IMAP credentials** (optional) — If connecting a non-Gmail account via IMAP, you'll need the IMAP host, port, and an app-specific password from your email provider.

> **Tip:** Google OAuth is entirely optional. You can sign in to the dashboard with email/password and connect email via IMAP or Apps Script — no Google Cloud project needed. Only set up Google OAuth if you want "Sign in with Google" on the dashboard or want to connect a Gmail account via OAuth.

### 1. Install

```bash
git clone https://github.com/yourusername/agentcloak.git
cd agentcloak
pnpm install
```

### 2. Set up Google Cloud project (optional)

Google OAuth is **optional**. You only need it if you want:
- "Sign in with Google" on the dashboard (email/password works without it)
- Gmail OAuth as an email connection method (IMAP and Apps Script work without it)

If you don't need either, skip to [step 3](#3-configure-environment).

**Create a project and enable the Gmail API:**

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top and select **New Project**. Give it a name (e.g. "AgentCloak") and click **Create**.
3. Make sure your new project is selected in the project dropdown.
4. Go to **APIs & Services > Library** (or search "Gmail API" in the top search bar).
5. Find **Gmail API** and click **Enable**.

**Configure the OAuth consent screen:**

6. Go to **APIs & Services > OAuth consent screen**.
7. Select **External** as the user type and click **Create**.
   > "Internal" is only available for Google Workspace orgs. External works for all Google accounts.
8. Fill in the required fields on the app info page:
   - **App name**: anything (e.g. "AgentCloak")
   - **User support email**: your email address
   - **Developer contact email**: your email address
   - Leave everything else blank/default and click **Save and Continue**.
9. On the **Scopes** page, click **Add or Remove Scopes** and add the following:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`

   Click **Update**, then **Save and Continue**.
   > The first three scopes are used for dashboard login. The last two are used when connecting a Gmail account (read emails + create drafts).
10. On the **Test users** page, click **Add Users** and add the **Gmail address(es)** you want to access through AgentCloak. This is required — only listed test users can sign in while the app is in testing mode.

    Click **Save and Continue**, then **Back to Dashboard**.

> **Important:** Your app will be in **Testing** mode by default. This is fine — you do **not** need to publish or verify the app. Testing mode just limits sign-in to the test users you added above. If you skip adding test users, you'll get a "403: access_denied" error when trying to sign in.

**Create OAuth credentials:**

11. Go to **APIs & Services > Credentials**.
12. Click **Create Credentials > OAuth client ID**.
13. Set **Application type** to **Web application**.
14. Under **Authorized redirect URIs**, click **Add URI** and enter:
    ```
    http://localhost:3000/auth/callback
    ```
    > If you changed the port in your `.env`, use that port instead.
15. Click **Create**. Copy the **Client ID** and **Client Secret** — you'll need them in the next step.

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Required — random string, 32+ characters (used for session cookies)
SESSION_SECRET=change-me-to-a-random-string-at-least-32-chars

# Server
BASE_URL=http://localhost:3000
PORT=3000

# Optional — Google OAuth credentials (only needed for Google sign-in and Gmail OAuth connections)
# GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
# GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
```

Without the Google OAuth variables, the dashboard shows only email/password sign-in. With them, both methods are available.

### 4. Build and start the server

```bash
pnpm build   # builds all packages (server, web dashboard, CLI, stdio bridge)
pnpm dev     # starts the server on http://localhost:3000
```

The SQLite database is created automatically at `data/agentcloak.db` on first run. The server serves both the API and the web dashboard from the same process.

### 5. Sign in to the dashboard

Open **http://localhost:3000**. You can create an account with email/password, or use "Sign in with Google" if you configured Google OAuth in step 2. The dashboard is where you manage connections, API keys, and filters.

> **Password reset:** Since AgentCloak runs locally without an email service, use the CLI to reset passwords:
> ```bash
> agentcloak reset-password --email user@example.com
> ```
> This prompts for a new password and invalidates all existing sessions.

### 6. Connect an email account

From the **Connections** page:

- **Gmail (OAuth)** — Click "Connect Gmail". You'll authorize read-only access through Google OAuth. AgentCloak stores the OAuth tokens server-side. Requires the Google Cloud project from step 2.
- **Gmail (Apps Script)** — Click "Connect via Apps Script". This is the fastest way to connect Gmail — no Google Cloud project needed for email access. You copy a generated script into [script.google.com](https://script.google.com), authorize it with one click, deploy it as a web app, and paste the URL back. See [Apps Script setup](#apps-script-setup) below for details.
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

**Claude Code (recommended — zero install):**

Claude Code connects directly to AgentCloak's MCP endpoint over HTTP. No local packages or proxies needed.

Add to a single project (local scope):
```bash
claude mcp add --transport http agentcloak http://localhost:3000/mcp \
  --header "Authorization: Bearer ac_your_key_here"
```

Add globally (available in all projects):
```bash
claude mcp add --transport http agentcloak --scope user http://localhost:3000/mcp \
  --header "Authorization: Bearer ac_your_key_here"
```

Or edit `~/.claude.json` directly. Claude Code reads MCP servers from three scopes. **The highest-priority scope wins, so only configure each server in one scope** to avoid confusion when updating API keys.

| Priority | Scope | Location | When to use |
|----------|-------|----------|-------------|
| 1 (highest) | Project-local | `~/.claude.json` under `projects["/path"].mcpServers` | Different projects need different API keys (e.g., different email accounts) |
| 2 | Project-shared | `.mcp.json` in project root (committed to git) | Shared team config. Don't put secrets here. |
| 3 (lowest) | User/global | `~/.claude.json` top-level `mcpServers` | Same server available in all projects |

**Global** — add to the top-level `mcpServers` in `~/.claude.json`:

```json
{
  "mcpServers": {
    "agentcloak": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer ac_your_key_here"
      }
    }
  }
}
```

**Project-local** — add under a specific project path in `~/.claude.json`. This overrides global config when Claude Code is launched from that directory:

```json
{
  "projects": {
    "/Users/you/your-project": {
      "mcpServers": {
        "agentcloak": {
          "type": "http",
          "url": "http://localhost:3000/mcp",
          "headers": {
            "Authorization": "Bearer ac_your_key_here"
          }
        }
      }
    }
  }
}
```

**Project-shared** — create `.mcp.json` in the project root (committed to git). Use env vars for secrets:

```json
{
  "mcpServers": {
    "agentcloak": {
      "type": "http",
      "url": "${AGENTCLOAK_URL:-http://localhost:3000}/mcp",
      "headers": {
        "Authorization": "Bearer ${AGENTCLOAK_API_KEY}"
      }
    }
  }
}
```

> **Common pitfalls:**
> - **`~/.claude/mcp.json` is NOT a recognized config file.** Don't put MCP configs there.
> - **Don't define the same server in multiple scopes.** If agentcloak exists at both project-local and global scope, the project-local config wins silently. Updating the global key will have no effect.
> - **When updating an API key**, search `~/.claude.json` for the server name first to confirm which scope it's configured in.
> - **Restart Claude Code** after any config change. MCP connections are established at startup.

After adding, restart Claude Code. The AgentCloak tools (`search_emails`, `read_email`, etc.) will appear automatically.

**Other MCP clients:**

Any MCP client that supports Streamable HTTP transport can connect to `http://localhost:3000/mcp` with the header `Authorization: Bearer ac_...`.

For stdio-only clients (that don't support HTTP transport), use the `@agentcloak/mcp-stdio` package as a bridge.

## Cloud Deployment (Railway)

AgentCloak can be deployed to [Railway](https://railway.com) for multi-tenant cloud hosting. This lets multiple users sign up, connect their own email accounts, and generate API keys — without running anything locally.

### Deploy to Railway

1. **Install the Railway CLI** and log in:
   ```bash
   brew install railway
   railway login
   ```

2. **Create a project and service:**
   ```bash
   railway init
   ```

3. **Add a persistent volume** at `/app/data` (for the SQLite database):
   ```bash
   railway volume add --mount /app/data
   ```

4. **Set environment variables:**
   ```bash
   railway variables set SESSION_SECRET="$(openssl rand -hex 32)"
   railway variables set BASE_URL="https://your-app.up.railway.app"
   railway variables set PORT=3000
   railway variables set DATABASE_PATH=/app/data/agentcloak.db
   ```

   If using Google OAuth, also set:
   ```bash
   railway variables set GOOGLE_CLIENT_ID="your-client-id"
   railway variables set GOOGLE_CLIENT_SECRET="your-secret"
   railway variables set GOOGLE_REDIRECT_URI="https://your-app.up.railway.app/auth/callback"
   ```

5. **Deploy:**
   ```bash
   railway up
   ```

6. **Generate a public domain** from the Railway dashboard or CLI.

### Connecting Claude Code to a cloud deployment

Replace `localhost:3000` with your Railway URL:

```bash
claude mcp add --transport http agentcloak --scope user \
  https://your-app.up.railway.app/mcp \
  --header "Authorization: Bearer ac_your_key_here"
```

Or in `~/.claude.json`:

```json
{
  "mcpServers": {
    "agentcloak": {
      "type": "http",
      "url": "https://your-app.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer ac_your_key_here"
      }
    }
  }
}
```

### Multi-tenant notes

- Each user signs up with email/password on the dashboard, connects their own Gmail (via OAuth), and generates their own API key.
- If using Google OAuth for Gmail connections, the server operator sets up the GCP project once. Users just need to be added as test users in the Google Cloud Console (or the OAuth app can be published to remove this restriction).
- The Apps Script connection method is designed for self-hosters and may not work for multi-tenant deployments due to Google's authorization flow.

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

## CLI Commands

| Command | Description |
|---------|-------------|
| `agentcloak setup` | Interactive setup wizard (saves server URL and API key) |
| `agentcloak connect <provider>` | Open browser to connect an email provider |
| `agentcloak keys create <name>` | Create an API key (direct SQLite access) |
| `agentcloak keys list` | List all API keys |
| `agentcloak keys revoke <prefix>` | Revoke an API key by prefix |
| `agentcloak filters show` | Show filter config for a connection |
| `agentcloak filters add-domain <domain>` | Add a blocked domain |
| `agentcloak filters add-subject <pattern>` | Add a blocked subject pattern |
| `agentcloak reset-password --email <email>` | Reset password for an account (prompts for new password, invalidates sessions) |
| `agentcloak status` | Check if the server is running |

## Apps Script Setup

The Apps Script provider lets you connect Gmail without setting up a Google Cloud project. Instead of OAuth, it uses a Google Apps Script deployed as a web app to bridge AgentCloak to your Gmail. The full filter pipeline still runs on the AgentCloak side — the script just handles the Gmail API calls.

**When to use this:** You want the fastest path to connecting Gmail, or you don't want to deal with the Google Cloud Console, consent screens, and test user management.

**When to use OAuth instead:** You already have a Google Cloud project set up, or you prefer not to have a separate Apps Script deployment to manage.

### Steps

1. In the AgentCloak dashboard, click **"Connect via Apps Script"**.
2. A script is generated with a unique secret key. Click **"Copy Script"**.
3. Go to [script.google.com](https://script.google.com) and create a new project.
4. Delete the default code and paste the copied script. Click **Save** (or Ctrl/Cmd+S).
5. Click **Run**. A dialog will ask you to authorize the script:
   - Click **"Review permissions"** and select your Google account.
   - Google will show a **"Google hasn't verified this app"** warning. This is expected — you wrote the script yourself, it's not a published app.
   - Click **"Advanced"** (at the bottom left of the warning).
   - Click **"Go to \<project name\> (unsafe)"** at the very bottom.
   - A Google authorization dialog will appear asking for Gmail permissions. **Check the checkbox** to grant access, then click **"Continue"**.
6. After the script finishes running (you'll see "Execution completed" in the log), click **Deploy > New deployment**.
7. Set the type to **Web app**, "Execute as" to **Me**, and "Who has access" to **Anyone**.
8. Click **Deploy** and copy the deployment URL.
9. Back in AgentCloak, paste the URL and click **"Test Connection"**. You should see your email address confirmed.
10. Click **"Connect"**.

The connection now works identically to Gmail OAuth — all the same MCP tools, filters, and safety features apply.

### How it works

The generated script contains a secret that authenticates requests between AgentCloak and the script. The secret is encrypted at rest in AgentCloak's database (same as IMAP credentials). The script runs under your Google account and uses `GmailApp` to search, read, and create drafts. AgentCloak sends requests to the script's web app URL, and the script returns email data that passes through AgentCloak's filter pipeline before reaching the agent.

### Limitations compared to Gmail OAuth

- **GAS execution limits** — Google Apps Script has a 6-minute execution time limit per request. Complex queries on large mailboxes may be slower.
- **Search returns max 500 threads** — `GmailApp.search()` has a 500-thread cap per query. For most use cases this is sufficient.
- **No push notifications** — Polling only. There's no real-time notification when new emails arrive.
- **Script redeployment** — If the script template is updated in a future AgentCloak version, you'll need to copy the new script and create a new deployment.
- **Result count is estimated** — The total result count is a minimum estimate, not an exact count.

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

[Business Source License 1.1](LICENSE) — You can self-host for internal use, personal projects, and non-commercial purposes. The only restriction is offering it as a competing hosted service. On February 18, 2030, the code converts to Apache 2.0.
