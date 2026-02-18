# AgentCloak - Development Guide

## Project Overview

AgentCloak is an MCP (Model Context Protocol) proxy between AI agents and email. It holds credentials server-side, filters sensitive content, redacts PII, and sanitizes for prompt injection.

## Architecture

Monorepo using pnpm workspaces with four packages:

- **packages/server** — Hono HTTP server + MCP SDK (Streamable HTTP transport), SQLite storage, Gmail/IMAP/Apps Script providers, content filter pipeline
- **packages/web** — React + Tailwind + Vite SPA dashboard (login, connections, filters, API keys)
- **packages/cli** — Commander CLI for setup, key management, filters, password reset
- **packages/mcp-stdio** — Stdio-to-HTTP proxy for MCP clients that don't support HTTP transport (not needed for Claude Code)

## Key Files

- `packages/server/src/index.ts` — HTTP server entry point, MCP route handler (bypasses Hono for POST /mcp)
- `packages/server/src/mcp/route.ts` — MCP request handler, creates per-request StreamableHTTPServerTransport
- `packages/server/src/mcp/tools/` — MCP tool definitions (search, read, threads, drafts, labels)
- `packages/server/src/routes/auth.ts` — Email/password register + login endpoints
- `packages/server/src/routes/oauth.ts` — Google OAuth login + Gmail connection flow
- `packages/server/src/routes/api.ts` — Dashboard API routes (session-authenticated)
- `packages/server/src/storage/sqlite.ts` — SQLite storage implementation (schema v4)
- `packages/server/src/config.ts` — Zod-validated config from env vars (Google OAuth fields are optional)
- `packages/server/src/auth/password.ts` — scrypt password hashing
- `packages/server/src/auth/rate-limit.ts` — In-memory sliding-window rate limiter
- `packages/web/src/pages/LoginPage.tsx` — Login/register page (email/password + optional Google OAuth)
- `packages/web/src/pages/ConnectionsPage.tsx` — Connection management with Add dropdown

## Build Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (server, web, cli, mcp-stdio)
pnpm dev              # Start dev server on localhost:3000
pnpm -C packages/server exec tsc -b   # Type-check server only
pnpm -C packages/web exec vite build  # Build web dashboard only
```

## Database

SQLite at `data/agentcloak.db` (or `DATABASE_PATH` env var). Schema version 4. Migrations run automatically on startup in `sqlite.ts`. Key tables: accounts, sessions, email_connections, api_keys, filter_configs.

## Authentication

- **Dashboard:** Session cookies (email/password or Google OAuth)
- **MCP endpoint:** API keys (prefixed `ac_`, hashed with SHA-256, stored in api_keys table)
- **Google OAuth:** Optional — config fields are `.optional()` in Zod schema. `isGoogleOAuthConfigured()` guards all OAuth routes.

## Production Deployment (Railway)

The production instance is deployed on Railway:

- **URL:** https://agentcloak.up.railway.app
- **Railway project:** motivated-fulfillment
- **Service:** agentcloak
- **Persistent volume:** Mounted at `/app/data` (holds SQLite database)
- **Docker:** Uses `deploy/docker/Dockerfile` (multi-stage build: deps, build, production)

### Deploying changes

```bash
# From the agentcloak directory (must have Railway CLI linked)
railway up --detach
```

This builds the Docker image on Railway and deploys it. Builds typically take 2-3 minutes. The `--detach` flag returns immediately; check build logs at the URL printed.

### Environment variables on Railway

Set via `railway variables set KEY=VALUE` or the Railway dashboard:

- `SESSION_SECRET` — Random 32+ char string
- `BASE_URL` — `https://agentcloak.up.railway.app`
- `PORT` — `3000`
- `DATABASE_PATH` — `/app/data/agentcloak.db`
- `GOOGLE_CLIENT_ID` — Google OAuth client ID (optional)
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret (optional)
- `GOOGLE_REDIRECT_URI` — `https://agentcloak.up.railway.app/auth/callback` (optional)

### Checking Railway status

```bash
railway logs --tail 20        # Recent server logs
railway logs --build --tail 20 # Recent build logs
railway status                 # Project/service info
```

### Important: Accept header compatibility

The MCP SDK's `StreamableHTTPServerTransport` requires clients to send `Accept: application/json, text/event-stream`. Some MCP clients (including Claude Code) only send `Accept: application/json`. The server patches `req.headers.accept` AND `req.rawHeaders` before passing to the transport — both must be patched because Hono's `@hono/node-server` reads from `rawHeaders`, not `headers`.

## MCP Client Configuration (Claude Code)

Claude Code connects directly to the MCP endpoint over HTTP. All configuration lives in `~/.claude.json`.

### Config scopes (highest priority first)

When the same MCP server is defined in multiple scopes, the highest-priority scope wins. **Only configure each server in one scope** to avoid confusion when updating API keys.

#### 1. Project-level (recommended for project-specific keys)

In `~/.claude.json`, under `projects["/path/to/project"].mcpServers`:

```json
{
  "projects": {
    "/Users/you/DevProjects/PersonalAgent": {
      "mcpServers": {
        "agentcloak": {
          "type": "http",
          "url": "https://agentcloak.up.railway.app/mcp",
          "headers": {
            "Authorization": "Bearer ac_your_key_here"
          }
        }
      }
    }
  }
}
```

This scope only applies when Claude Code is launched from the matching project directory. Use this when different projects need different API keys (e.g., different email accounts).

#### 2. Project root `.mcp.json` (shared with team, committed to git)

Create `.mcp.json` in the project root. **Do not put API keys here** since it's committed to git — use this for servers that don't require secrets.

#### 3. User/global

In `~/.claude.json`, at the top level:

```json
{
  "mcpServers": {
    "agentcloak": {
      "type": "http",
      "url": "https://agentcloak.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer ac_your_key_here"
      }
    }
  }
}
```

This scope applies to all projects. Use this when you want the same server available everywhere.

### Adding via CLI

```bash
# Project-level (for current project only)
claude mcp add --transport http agentcloak --scope project <url> --header "Authorization: Bearer ac_..."

# Global (all projects)
claude mcp add --transport http agentcloak --scope user <url> --header "Authorization: Bearer ac_..."
```

### Common pitfalls

- **`~/.claude/mcp.json` is NOT a recognized config file.** Don't put MCP configs there.
- **Don't define the same server in multiple scopes.** If you put agentcloak in both project-level and global, updating the global key won't take effect because the project-level config takes priority. Pick one scope per server.
- **When updating an API key**, verify which scope the server is configured in by searching `~/.claude.json` for the server name before making changes.
