# Multi-Account Support: Single Server with Account Parameter

## Overview

Refactor AgentCloak so that a single MCP server instance (one API key, one MCP config entry) can access multiple email connections. The agent selects which account to use via an `account` parameter on each tool, with a `list_connections` discovery tool. This follows the pattern established by [google-workspace-mcp](https://github.com/aaronsb/google-workspace-mcp).

### Why this approach over multiple MCP server instances

- Avoids duplicating tools (7 x N accounts) which degrades agent tool selection accuracy ([Anthropic research](https://www.anthropic.com/engineering/advanced-tool-use))
- Follows Anthropic's "consolidate rather than list" guidance ([tool design guide](https://www.anthropic.com/engineering/writing-tools-for-agents))
- Enables cross-account operations ("search all my inboxes")
- Scales to N accounts with constant tool count (8 tools total)
- One MCP config entry regardless of how many email accounts

### Design decisions

- **When `account` is omitted:** If only one connection exists, use it. If multiple exist, search/read across ALL connections (results tagged with account). For write operations (`create_draft`), `account` is required when multiple connections exist.
- **API key scope:** Changes from per-connection to per-account. One API key grants access to all active connections under that account.
- **Filter configs:** Remain per-connection. Each connection keeps its own filter pipeline.
- **Backward compatibility:** Old per-connection API keys continue to work, scoped to their original connection only.

---

## Current Architecture (reference)

### Key files

| File | Purpose |
|------|---------|
| `packages/server/src/storage/types.ts` | `StoredApiKey`, `StoredEmailConnection`, `Storage` interface |
| `packages/server/src/storage/sqlite.ts` | SQLite schema (v4), all storage methods |
| `packages/server/src/index.ts` | HTTP server, POST /mcp handler, API key auth |
| `packages/server/src/mcp/route.ts` | `handleMcpRequest()` — loads single connection, creates provider + pipeline, registers tools |
| `packages/server/src/mcp/tools/index.ts` | `registerAllTools()` — injects provider + pipeline into each tool |
| `packages/server/src/mcp/tools/*.ts` | Individual tool implementations (search, read, threads, drafts, labels, provider-info) |
| `packages/server/src/providers/types.ts` | `EmailProvider` interface |
| `packages/server/src/routes/api.ts` | Dashboard API routes (keys created per-connection) |
| `packages/web/src/pages/ConnectionDetailPage.tsx` | Per-connection API key management UI |
| `packages/web/src/pages/ConnectionsPage.tsx` | Connection list page |
| `packages/web/src/api/client.ts` | Frontend API client |
| `packages/web/src/api/types.ts` | Frontend type definitions |

### Current data model

```
Account (1) ──→ EmailConnection (N) ──→ ApiKey (N per connection)
                                    ──→ FilterConfig (1 per connection)
```

### Current request flow

```
POST /mcp + Bearer ac_xxx
  → hash key → lookup StoredApiKey → get connectionId
  → handleMcpRequest(req, res, connectionId, storage, config)
    → storage.getConnection(connectionId) → single connection
    → createProvider(connection) → single EmailProvider
    → storage.getFilterConfig(connectionId) → single FilterPipeline
    → registerAllTools(mcpServer, provider, pipeline)
      → each tool receives one provider, one pipeline
```

### Current schema (v4)

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES email_connections(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
```

---

## Phase 1: Database Schema Migration (v4 → v5)

**File:** `packages/server/src/storage/sqlite.ts`

### Changes

1. Make `connection_id` nullable on `api_keys` table. Account-level keys will have `connection_id = NULL`.
2. Update `CURRENT_SCHEMA_VERSION` from 4 to 5.

### Migration SQL (`migrateFromV4ToV5`)

SQLite doesn't support `ALTER COLUMN`, so we need to recreate the table:

```sql
-- Step 1: Create new table with nullable connection_id
CREATE TABLE api_keys_new (
  id TEXT PRIMARY KEY,
  connection_id TEXT REFERENCES email_connections(id) ON DELETE CASCADE,  -- NOW NULLABLE
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);

-- Step 2: Copy existing data
INSERT INTO api_keys_new SELECT * FROM api_keys;

-- Step 3: Drop old table and rename
DROP TABLE api_keys;
ALTER TABLE api_keys_new RENAME TO api_keys;
```

Wrap in a transaction. Run inside `init()` when `version === 4`.

### Fresh install schema (`createSchemaV5`)

Copy `createSchemaV4`, change `connection_id TEXT NOT NULL` to `connection_id TEXT` in `api_keys`.

### Update `init()` method

```typescript
} else if (version === 4) {
  this.migrateFromV4ToV5();
}
// version >= 5: already up to date
```

---

## Phase 2: Storage Interface & Implementation

**File:** `packages/server/src/storage/types.ts`

### Type changes

```typescript
export interface StoredApiKey {
  id: string;
  connectionId: string | null;  // null = account-level key (access all connections)
  accountId: string;
  name: string;
  keyHash: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}
```

### New storage method

Add to `Storage` interface:

```typescript
createAccountApiKey(key: Omit<StoredApiKey, 'connectionId'> & { connectionId: null }): Promise<void>;
```

Actually, the existing `createApiKey(key: StoredApiKey)` already works since `connectionId` is now `string | null`. No new method needed — just update the type.

**File:** `packages/server/src/storage/sqlite.ts`

### Update `rowToApiKey()`

```typescript
private rowToApiKey(row: Record<string, unknown>): StoredApiKey {
  return {
    id: row.id as string,
    connectionId: (row.connection_id as string) ?? null,  // Handle NULL
    accountId: row.account_id as string,
    // ... rest unchanged
  };
}
```

### Update `createApiKey()`

The existing SQL `INSERT INTO api_keys (id, connection_id, account_id, ...)` already handles null values. Just ensure the prepared statement doesn't reject null for `connection_id`.

---

## Phase 3: API Key Auth — Resolve Connections

**File:** `packages/server/src/index.ts`

### Current behavior (line 163-167)

```typescript
await handleMcpRequest(req, res, storedKey.connectionId, storage, config);
```

### New behavior

After looking up the API key, resolve which connections it can access:

```typescript
// After API key lookup (line 134-139)
const storedKey = await storage.getApiKeyByHash(keyHash);

let connectionIds: string[];
if (storedKey.connectionId) {
  // Legacy per-connection key — single connection only
  connectionIds = [storedKey.connectionId];
} else {
  // Account-level key — all active connections for the account
  const connections = await storage.listConnections(storedKey.accountId);
  connectionIds = connections
    .filter(c => c.status === "active")
    .map(c => c.id);
}

if (connectionIds.length === 0) {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "No active email connections. Connect an email account first." }));
  return;
}

// Pass all accessible connection IDs + accountId to MCP handler
await handleMcpRequest(req, res, connectionIds, storedKey.accountId, storage, config);
```

---

## Phase 4: MCP Route — Multi-Connection Support

**File:** `packages/server/src/mcp/route.ts`

### Change signature

```typescript
export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  connectionIds: string[],       // was: connectionId: string
  accountId: string,             // NEW
  storage: Storage,
  config: Config,
): Promise<void> {
```

### Build a connection registry

Instead of creating a single provider, build a map of connections with their providers and pipelines:

```typescript
interface ConnectionContext {
  connection: StoredEmailConnection;
  provider: EmailProvider;
  pipeline: FilterPipeline;
}

const connectionMap = new Map<string, ConnectionContext>(); // keyed by email address
const connectionList: Array<{ email: string; provider: string; displayName: string | null }> = [];

for (const connId of connectionIds) {
  const connection = await storage.getConnection(connId);
  if (!connection || connection.status !== "active") continue;

  const provider = createProvider(connection, config, storage);
  const filterConfig = await storage.getFilterConfig(connId);
  const pipeline = new FilterPipeline(filterConfig);

  connectionMap.set(connection.email, { connection, provider, pipeline });
  connectionList.push({
    email: connection.email,
    provider: connection.provider,
    displayName: connection.displayName,
  });
}

if (connectionMap.size === 0) {
  // Return 404 error
}
```

### Update McpServer initialization

Set `instructions` to tell the agent about available accounts:

```typescript
const accountEmails = connectionList.map(c => c.email).join(", ");
const mcpServer = new McpServer({
  name: "agentcloak",
  version: "0.1.0",
  instructions: connectionMap.size === 1
    ? `This server provides email access for ${accountEmails}. All email tools operate on this account.`
    : `This server provides email access for multiple accounts: ${accountEmails}. Use the list_connections tool to see available accounts. Most tools accept an optional 'account' parameter (email address) to specify which account to use. If omitted, tools will search across all accounts. For write operations like create_draft, 'account' is required when multiple accounts are connected.`,
});
```

**Note:** The `McpServer` constructor from `@modelcontextprotocol/sdk` accepts an `instructions` field — verify this in the SDK types. If not, it may need to be set on the `InitializeResult` instead. Check the MCP SDK source for how to set server instructions.

### Pass connection context to tools

```typescript
registerAllTools(mcpServer, connectionMap, connectionList);
```

---

## Phase 5: Tool Registration — Add `account` Parameter

**File:** `packages/server/src/mcp/tools/index.ts`

### New signature

```typescript
import type { ConnectionContext } from "../route.js"; // export the interface

export function registerAllTools(
  server: McpServer,
  connectionMap: Map<string, ConnectionContext>,
  connectionList: Array<{ email: string; provider: string; displayName: string | null }>,
) {
  registerListConnections(server, connectionList);
  registerSearchEmails(server, connectionMap);
  registerReadEmail(server, connectionMap);
  registerListThreads(server, connectionMap);
  registerGetThread(server, connectionMap);
  registerCreateDraft(server, connectionMap);
  registerListDrafts(server, connectionMap);
  registerListLabels(server, connectionMap);
  registerProviderInfo(server, connectionMap);
}
```

### Helper: resolve connection from `account` parameter

Create `packages/server/src/mcp/tools/resolve-connection.ts`:

```typescript
import type { ConnectionContext } from "../route.js";

/**
 * Resolve which connection(s) to use based on the account parameter.
 * - If account is provided, returns the matching connection or throws.
 * - If account is omitted and there's only one connection, returns it.
 * - If account is omitted and there are multiple, returns all (for read ops).
 */
export function resolveConnection(
  connectionMap: Map<string, ConnectionContext>,
  account?: string,
): ConnectionContext {
  if (account) {
    const ctx = connectionMap.get(account);
    if (!ctx) {
      throw new Error(
        `Account '${account}' not found. Available accounts: ${[...connectionMap.keys()].join(", ")}`
      );
    }
    return ctx;
  }

  if (connectionMap.size === 1) {
    return connectionMap.values().next().value!;
  }

  throw new Error(
    `Multiple accounts connected. Specify 'account' parameter. Available: ${[...connectionMap.keys()].join(", ")}`
  );
}

/**
 * For read operations that can span multiple accounts.
 * Returns all connections if no account specified.
 */
export function resolveConnections(
  connectionMap: Map<string, ConnectionContext>,
  account?: string,
): ConnectionContext[] {
  if (account) {
    return [resolveConnection(connectionMap, account)];
  }
  return [...connectionMap.values()];
}
```

---

## Phase 6: New Tool — `list_connections`

**New file:** `packages/server/src/mcp/tools/list-connections.ts`

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerListConnections(
  server: McpServer,
  connectionList: Array<{ email: string; provider: string; displayName: string | null }>,
) {
  server.tool(
    "list_connections",
    "List all connected email accounts. Call this first to see available accounts. Use the email address as the 'account' parameter in other tools.",
    {},
    async () => {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            connections: connectionList.map(c => ({
              email: c.email,
              provider: c.provider,
              displayName: c.displayName,
            })),
            count: connectionList.length,
            usage: connectionList.length === 1
              ? "Only one account connected. The 'account' parameter is optional on all tools."
              : "Multiple accounts connected. Use the email address as the 'account' parameter on tools. For read operations (search, read, list), omitting 'account' searches all accounts.",
          }, null, 2),
        }],
      };
    },
  );
}
```

---

## Phase 7: Update Existing Tools

Every existing tool gets an optional `account` parameter. Read operations (search, read, list) support multi-account aggregation. Write operations (create_draft) require `account` when multiple connections exist.

### Pattern for read tools (search, read, list)

Example: `packages/server/src/mcp/tools/search-emails.ts`

```typescript
export function registerSearchEmails(
  server: McpServer,
  connectionMap: Map<string, ConnectionContext>,
) {
  const accountDesc = connectionMap.size > 1
    ? "Email address of the account to search. Omit to search all accounts. Use list_connections to see available accounts."
    : "Email address of the account to search. Optional when only one account is connected.";

  server.tool(
    "search_emails",
    "Search emails by query. Returns sanitized email summaries with sensitive content filtered. ...",
    {
      query: z.string().describe("Gmail search query ..."),
      max_results: z.number().min(1).max(200).default(20).describe("..."),
      page_token: z.string().optional().describe("..."),
      account: z.string().email().optional().describe(accountDesc),
    },
    async ({ query, max_results, page_token, account }) => {
      const contexts = resolveConnections(connectionMap, account);

      // Aggregate results across accounts
      const allResults: Array<{ account: string; results: unknown[] }> = [];
      let totalEstimate = 0;

      for (const ctx of contexts) {
        const result = await ctx.provider.search({ query, maxResults: max_results, pageToken: page_token });
        const { passed, blocked } = ctx.pipeline.processBatch(result.messages);

        const summaries = passed.map(m => ({
          id: m.id,
          threadId: m.threadId,
          subject: m.subject,
          from: formatAddress(m.from, ctx.pipeline),
          date: m.date,
          snippet: m.snippet,
          isUnread: m.isUnread,
          labels: m.labels,
          hasAttachments: m.attachments.length > 0,
          account: ctx.connection.email,  // Tag each result with its account
        }));

        allResults.push(...summaries);
        totalEstimate += result.resultSizeEstimate;
      }

      // Sort merged results by date descending
      allResults.sort((a, b) => /* date comparison */);

      const response = {
        results: allResults,
        totalResults: totalEstimate,
        // Note: pagination with multiple accounts is complex —
        // for v1, only support page_token when a single account is specified
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    },
  );
}
```

### Pattern for write tools (create_draft)

`create_draft` MUST know which account to send from. Use `resolveConnection` (singular), which throws if `account` is omitted with multiple connections:

```typescript
export function registerCreateDraft(
  server: McpServer,
  connectionMap: Map<string, ConnectionContext>,
) {
  server.tool(
    "create_draft",
    "Create an email draft. ...",
    {
      to: z.array(z.string().email()).optional().describe("..."),
      subject: z.string().describe("..."),
      body: z.string().describe("..."),
      in_reply_to_thread_id: z.string().optional().describe("..."),
      account: z.string().email().optional().describe(
        "Email address of the account to create the draft in. Required when multiple accounts are connected."
      ),
    },
    async ({ to, subject, body, in_reply_to_thread_id, account }) => {
      const ctx = resolveConnection(connectionMap, account);  // Throws if ambiguous
      // ... rest of existing logic, using ctx.provider
    },
  );
}
```

### All tools to update

| Tool | Type | Multi-account behavior |
|------|------|----------------------|
| `search_emails` | Read | Aggregate across accounts, tag results with `account` |
| `read_email` | Read | Must match to correct account (message IDs are provider-specific). Try each provider, return first match. Or require `account` param. |
| `list_threads` | Read | Aggregate across accounts, tag results with `account` |
| `get_thread` | Read | Same as `read_email` — try each or require `account` |
| `create_draft` | Write | Require `account` when multiple connections |
| `list_drafts` | Read | Aggregate across accounts, tag results with `account` |
| `list_labels` | Read | Aggregate, tag with `account` |
| `get_provider_info` | Read | Return info for all connections or specified one |

### Special case: `read_email` and `get_thread`

These take a message/thread ID. The ID is opaque and provider-specific — you can't tell which account it belongs to from the ID alone. Options:

**Option A (recommended):** Require `account` param for these tools when multiple connections exist. The agent already knows which account the ID came from (it was in the search/list results tagged with `account`).

**Option B:** Try each provider sequentially, return the first successful response. This is slower and may cause confusing errors if the ID doesn't exist in any account.

Go with **Option A**. The tool description should say: "When multiple accounts are connected, you must specify the 'account' parameter. Use the account value from the search or list results that returned this message/thread ID."

---

## Phase 8: Dashboard API — Account-Level API Keys

**File:** `packages/server/src/routes/api.ts`

### New routes

```
POST /api/keys              — Create account-level API key (no connection scope)
GET  /api/keys              — List all API keys for account (both account-level and per-connection)
DELETE /api/keys/:keyId     — Revoke any API key owned by the account
```

### Implementation

```typescript
// POST /api/keys — Create account-level key
api.post("/keys", async (c) => {
  const accountId = c.get("accountId");
  const body = await c.req.json<{ name: string }>();

  const { key, record } = await createApiKey(
    storage,
    null,           // connectionId = null (account-level)
    accountId,
    body.name.trim(),
  );

  return c.json({
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    key,  // Full key, shown once
    createdAt: record.createdAt,
  });
});

// GET /api/keys — List all keys for account
api.get("/keys", async (c) => {
  const accountId = c.get("accountId");
  const keys = await storage.listApiKeys(accountId);  // Already exists in Storage interface
  return c.json(keys.map(k => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    connectionId: k.connectionId,  // null for account-level, string for legacy per-connection
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
    revokedAt: k.revokedAt,
  })));
});

// DELETE /api/keys/:keyId — Revoke key (must belong to account)
api.delete("/keys/:keyId", async (c) => {
  const accountId = c.get("accountId");
  // Verify ownership before revoking
  // ... lookup key, check accountId matches
  await storage.revokeApiKey(c.req.param("keyId"));
  return c.json({ ok: true });
});
```

### Update `createApiKey()`

**File:** `packages/server/src/auth/keys.ts`

Change signature to accept nullable `connectionId`:

```typescript
export async function createApiKey(
  storage: Storage,
  connectionId: string | null,  // was: string
  accountId: string,
  name: string,
): Promise<{ key: string; record: StoredApiKey }> {
```

### Keep existing per-connection routes

The existing `POST /api/connections/:id/keys` route continues to work for backward compatibility. It creates keys scoped to a specific connection (the legacy behavior). Consider deprecating these in favor of account-level keys over time.

---

## Phase 9: Web Dashboard — API Keys Page

### New page: `packages/web/src/pages/ApiKeysPage.tsx`

A new top-level page for managing account-level API keys.

**Layout:**
- Heading: "API Keys"
- "Create Key" button
- List of all keys (both account-level and per-connection)
- Each key shows: name, prefix, scope badge ("All accounts" or specific email), last used, revoke button

**Create key flow:**
1. User clicks "Create Key"
2. Modal opens with:
   - Key name input
   - Scope selector: "All connected accounts" (default) vs specific connection (dropdown of connected emails)
3. On submit → `POST /api/keys` (account-level) or `POST /api/connections/:id/keys` (connection-scoped)
4. Key displayed in green banner with copy button

**Key list display:**

```
[Key icon] claude-code           ac_cR0k3...    All accounts    Used today    [Revoke]
[Key icon] work-only             ac_x7JNg...    ryan@work.com   Never used    [Revoke]
[Key icon] legacy-key            ac_hRgI7...    ryan@gmail.com  Used 2/17     [Revoke]
```

### Update navigation

**File:** `packages/web/src/App.tsx`

Add route:
```tsx
<Route path="/keys" element={<ApiKeysPage />} />
```

**File:** `packages/web/src/components/Sidebar.tsx`

Add nav link: "API Keys" with Key icon, between "Connections" and "Settings".

### Update ConnectionDetailPage

**File:** `packages/web/src/pages/ConnectionDetailPage.tsx`

Two options:

**Option A (simpler):** Remove the API Keys section from this page entirely. Add a link: "Manage API keys →" that navigates to `/keys`. Keep the filter config section on this page (filters are per-connection).

**Option B:** Keep showing keys relevant to this connection (both account-level keys that can access it and connection-scoped keys), but as read-only with a link to `/keys` for management.

Recommend **Option A** for simplicity.

### Update frontend API client

**File:** `packages/web/src/api/client.ts`

Add methods:

```typescript
listAccountKeys: () => request<ApiKey[]>("/api/keys"),
createAccountKey: (name: string) =>
  request<ApiKey>("/api/keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  }),
revokeAccountKey: (keyId: string) =>
  request<void>(`/api/keys/${keyId}`, { method: "DELETE" }),
```

### Update frontend types

**File:** `packages/web/src/api/types.ts`

Update `ApiKey`:

```typescript
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  key?: string;           // Only on creation
  connectionId: string | null;  // null = account-level
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}
```

### Update Settings page

**File:** `packages/web/src/pages/SettingsPage.tsx`

Update the MCP configuration example to show the simplified single-server config and reference the new API Keys page for key management.

---

## Phase 10: Update MCP Server Instructions

**File:** `packages/server/src/mcp/route.ts`

When creating the `McpServer`, set the `instructions` field dynamically based on connected accounts. This helps the agent understand what the server does and which accounts are available.

See Phase 4 above for the exact implementation. The `instructions` string should:
- List all connected email addresses
- Explain that `list_connections` shows available accounts
- Explain that read tools aggregate across accounts when `account` is omitted
- Explain that write tools require `account` when multiple connections exist

---

## Migration & Backward Compatibility

### Existing per-connection API keys

- Continue to work exactly as before
- `connectionId` is non-null, so the MCP handler resolves to a single connection
- Tools work in single-account mode (no `account` parameter needed)
- No user action required

### New account-level API keys

- `connectionId` is null
- MCP handler loads all active connections for the account
- Tools work in multi-account mode
- User creates these from the new API Keys page

### Database migration

- v4 → v5 migration makes `connection_id` nullable on `api_keys`
- Existing keys retain their `connection_id` values
- No data loss

---

## Verification Checklist

1. **Build:** `pnpm build` succeeds
2. **Type check:** `pnpm -C packages/server exec tsc --noEmit` passes
3. **Migration:** v4→v5 runs cleanly, existing data preserved
4. **Legacy key:** Per-connection API key still works, single-account behavior unchanged
5. **Account-level key with single connection:** All tools work without `account` parameter
6. **Account-level key with multiple connections:**
   - `list_connections` returns all accounts
   - `search_emails` without `account` returns results from all accounts, each tagged with `account` field
   - `search_emails` with `account` returns results from that account only
   - `read_email` without `account` and multiple connections → error with helpful message
   - `create_draft` without `account` and multiple connections → error with helpful message
   - `create_draft` with `account` → creates draft in correct account
7. **Dashboard:** New API Keys page works, keys can be created/revoked
8. **Settings:** MCP config example is updated
9. **Deploy:** `railway up --detach` succeeds, Railway instance works

---

## Implementation Order

1. **Phase 1:** Database migration (v4 → v5) — foundation for everything else
2. **Phase 2:** Storage types — update `StoredApiKey.connectionId` to `string | null`
3. **Phase 3:** API key auth in `index.ts` — resolve connection IDs from key
4. **Phase 4:** MCP route — accept multiple connection IDs, build connection registry
5. **Phase 5:** Tool registration — new signatures, `resolveConnection` helper
6. **Phase 6:** `list_connections` tool — new file
7. **Phase 7:** Update all 8 existing tools — add `account` parameter, multi-account logic
8. **Phase 8:** Dashboard API routes — account-level key CRUD
9. **Phase 9:** Web dashboard — new API Keys page, updated navigation
10. **Phase 10:** MCP server `instructions` — dynamic per-session instructions

Phases 1-7 are the core backend work. Phase 8-9 are the dashboard. Phase 10 is polish. Each phase can be built and tested incrementally.

---

## Files Changed Summary

| File | Action |
|------|--------|
| `packages/server/src/storage/sqlite.ts` | Edit — v5 migration, `createSchemaV5()`, update `rowToApiKey()` |
| `packages/server/src/storage/types.ts` | Edit — `StoredApiKey.connectionId` becomes `string \| null` |
| `packages/server/src/index.ts` | Edit — resolve connection IDs from API key, pass array to handler |
| `packages/server/src/mcp/route.ts` | Edit — accept `connectionIds[]`, build connection registry, set `instructions` |
| `packages/server/src/mcp/tools/index.ts` | Edit — new `registerAllTools` signature with connection map |
| `packages/server/src/mcp/tools/resolve-connection.ts` | **New** — helper to resolve account → connection(s) |
| `packages/server/src/mcp/tools/list-connections.ts` | **New** — `list_connections` tool |
| `packages/server/src/mcp/tools/search-emails.ts` | Edit — add `account` param, multi-account aggregation |
| `packages/server/src/mcp/tools/read-email.ts` | Edit — add `account` param |
| `packages/server/src/mcp/tools/list-threads.ts` | Edit — add `account` param, multi-account aggregation |
| `packages/server/src/mcp/tools/get-thread.ts` | Edit — add `account` param |
| `packages/server/src/mcp/tools/create-draft.ts` | Edit — add required `account` param for multi-account |
| `packages/server/src/mcp/tools/list-drafts.ts` | Edit — add `account` param, multi-account aggregation |
| `packages/server/src/mcp/tools/list-labels.ts` | Edit — add `account` param, multi-account aggregation |
| `packages/server/src/mcp/tools/provider-info.ts` | Edit — add `account` param |
| `packages/server/src/auth/keys.ts` | Edit — accept nullable `connectionId` |
| `packages/server/src/routes/api.ts` | Edit — add `POST/GET/DELETE /api/keys` routes |
| `packages/web/src/pages/ApiKeysPage.tsx` | **New** — account-level API key management page |
| `packages/web/src/App.tsx` | Edit — add `/keys` route |
| `packages/web/src/components/Sidebar.tsx` | Edit — add "API Keys" nav link |
| `packages/web/src/pages/ConnectionDetailPage.tsx` | Edit — remove API Keys section, add link to `/keys` |
| `packages/web/src/api/client.ts` | Edit — add account-level key methods |
| `packages/web/src/api/types.ts` | Edit — update `ApiKey` type |
| `packages/web/src/pages/SettingsPage.tsx` | Edit — update MCP config example |
