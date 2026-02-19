import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { ImapFlow } from "imapflow";
import { nanoid } from "nanoid";
import type { Config } from "../config.js";
import { isGoogleOAuthConfigured } from "../config.js";
import { createApiKey } from "../auth/keys.js";
import { sessionMiddleware, type SessionEnv } from "../auth/session.js";
import { GasProvider } from "../providers/gas/client.js";
import { generateGasScript } from "../providers/gas/script-template.js";
import { encryptPassword } from "../providers/imap/crypto.js";
import { generateConnectAuthUrl, generateReauthorizeAuthUrl } from "../providers/gmail/oauth.js";
import type { GasCredentials, ImapCredentials, Storage } from "../storage/types.js";

export function createApiRoutes(storage: Storage, config: Config) {
  const api = new Hono<SessionEnv>();

  // All routes require session auth
  api.use("*", sessionMiddleware(storage, config));

  // GET /api/me — Current account info
  api.get("/me", async (c) => {
    const accountId = c.get("accountId");
    const account = await storage.getAccount(accountId);
    if (!account) {
      return c.json({ error: "Account not found" }, 404);
    }
    return c.json({
      id: account.id,
      email: account.email,
      name: account.name,
      avatarUrl: account.avatarUrl,
    });
  });

  // GET /api/connections — List email connections
  api.get("/connections", async (c) => {
    const accountId = c.get("accountId");
    const connections = await storage.listConnections(accountId);
    return c.json(
      connections.map((conn) => ({
        id: conn.id,
        email: conn.email,
        provider: conn.provider,
        displayName: conn.displayName,
        status: conn.status,
        createdAt: conn.createdAt,
      })),
    );
  });

  // GET /api/connections/gmail/connect — Initiate Gmail OAuth
  api.get("/connections/gmail/connect", (c) => {
    if (!isGoogleOAuthConfigured(config)) {
      return c.json({ error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI." }, 400);
    }
    const accountId = c.get("accountId");
    const url = generateConnectAuthUrl(config, accountId);
    return c.redirect(url);
  });

  // GET /api/connections/:id/reauthorize — Re-authorize Gmail OAuth
  api.get("/connections/:id/reauthorize", async (c) => {
    if (!isGoogleOAuthConfigured(config)) {
      return c.json({ error: "Google OAuth is not configured" }, 400);
    }
    const accountId = c.get("accountId");
    const connectionId = c.req.param("id");

    // Verify connection exists and belongs to this account
    const conn = await storage.getConnection(connectionId);
    if (!conn || conn.accountId !== accountId) {
      return c.json({ error: "Connection not found" }, 404);
    }
    if (conn.provider !== "gmail") {
      return c.json({ error: "Re-authorization is only supported for Gmail connections" }, 400);
    }

    const url = generateReauthorizeAuthUrl(config, accountId, connectionId);
    return c.redirect(url);
  });

  // POST /api/connections/imap/test — Test IMAP credentials
  api.post("/connections/imap/test", async (c) => {
    const body = await c.req.json<{
      host: string;
      port: number;
      username: string;
      password: string;
      tls?: boolean;
    }>();

    if (!body.host || !body.port || !body.username || !body.password) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const portValidation = validateImapInput(body.host, body.port);
    if (portValidation) {
      return c.json({ success: false, error: portValidation }, 400);
    }

    const client = new ImapFlow({
      host: body.host,
      port: body.port,
      secure: body.tls !== false,
      auth: { user: body.username, pass: body.password },
      logger: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });

    try {
      await client.connect();
      await client.logout();
      return c.json({ success: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      return c.json({ success: false, error: message });
    } finally {
      try { await client.close(); } catch { /* already closed */ }
    }
  });

  // POST /api/connections/imap/connect — Connect IMAP account
  api.post("/connections/imap/connect", async (c) => {
    const accountId = c.get("accountId");
    const body = await c.req.json<{
      host: string;
      port: number;
      username: string;
      password: string;
      tls?: boolean;
      displayName?: string;
    }>();

    if (!body.host || !body.port || !body.username || !body.password) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const inputValidation = validateImapInput(body.host, body.port);
    if (inputValidation) {
      return c.json({ error: inputValidation }, 400);
    }

    const tls = body.tls !== false;

    // Test the connection first
    const client = new ImapFlow({
      host: body.host,
      port: body.port,
      secure: tls,
      auth: { user: body.username, pass: body.password },
      logger: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });

    try {
      await client.connect();
      await client.logout();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      return c.json({ error: `IMAP connection failed: ${message}` }, 400);
    } finally {
      try { await client.close(); } catch { /* already closed */ }
    }

    // Encrypt password
    const encrypted = encryptPassword(body.password, config.sessionSecret);

    const credentials: ImapCredentials = {
      type: "imap",
      host: body.host,
      port: body.port,
      username: body.username,
      encryptedPassword: encrypted.encryptedPassword,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      tls,
    };

    // Provider includes host to allow same email on different servers
    const providerKey = `imap:${body.host}`;

    // Create new connection
    const connId = nanoid();
    const now = Date.now();
    await storage.createConnection({
      id: connId,
      accountId,
      email: body.username,
      provider: providerKey,
      displayName: body.displayName || null,
      tokens: credentials,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Create default filter config
    await storage.upsertFilterConfig({
      connectionId: connId,
      blockedDomains: [],
      blockedSenderPatterns: [],
      blockedSubjectPatterns: [],
      piiRedactionEnabled: true,
      injectionDetectionEnabled: true,
      emailRedactionEnabled: true,
      showFilteredCount: true,
      securityBlockingEnabled: true,
      financialBlockingEnabled: true,
      sensitiveSenderBlockingEnabled: true,
      dollarAmountRedactionEnabled: true,
      attachmentFilteringEnabled: true,
      allowedFolders: [],
    });

    return c.json(
      {
        id: connId,
        email: body.username,
        provider: providerKey,
        displayName: body.displayName || null,
        status: "active",
        createdAt: now,
      },
      201,
    );
  });

  // GET /api/connections/gas/script — Generate GAS script + secret
  api.get("/connections/gas/script", (_c) => {
    const secret = randomBytes(32).toString("hex");
    const script = generateGasScript(secret);
    return _c.json({ secret, script });
  });

  // POST /api/connections/gas/test — Test GAS endpoint
  api.post("/connections/gas/test", async (c) => {
    const body = await c.req.json<{ endpointUrl: string; secret: string }>();

    if (!body.endpointUrl || !body.secret) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const urlError = validateGasUrl(body.endpointUrl);
    if (urlError) {
      return c.json({ success: false, error: urlError }, 400);
    }

    try {
      const result = await GasProvider.ping(body.endpointUrl, body.secret);
      return c.json({ success: true, email: result.email });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connection test failed";
      return c.json({ success: false, error: message });
    }
  });

  // POST /api/connections/gas/connect — Connect GAS account
  api.post("/connections/gas/connect", async (c) => {
    const accountId = c.get("accountId");
    const body = await c.req.json<{
      endpointUrl: string;
      secret: string;
      displayName?: string;
    }>();

    if (!body.endpointUrl || !body.secret) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const urlError = validateGasUrl(body.endpointUrl);
    if (urlError) {
      return c.json({ error: urlError }, 400);
    }

    // Ping to verify + get email
    let email: string;
    try {
      const result = await GasProvider.ping(body.endpointUrl, body.secret);
      email = result.email;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      return c.json({ error: `GAS connection failed: ${message}` }, 400);
    }

    const encrypted = encryptPassword(body.secret, config.sessionSecret);
    const credentials: GasCredentials = {
      type: "gas",
      endpointUrl: body.endpointUrl,
      encryptedSecret: encrypted.encryptedPassword,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    };

    // Create new connection
    const connId = nanoid();
    const now = Date.now();
    await storage.createConnection({
      id: connId,
      accountId,
      email,
      provider: "gas",
      displayName: body.displayName || null,
      tokens: credentials,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Create default filter config
    await storage.upsertFilterConfig({
      connectionId: connId,
      blockedDomains: [],
      blockedSenderPatterns: [],
      blockedSubjectPatterns: [],
      piiRedactionEnabled: true,
      injectionDetectionEnabled: true,
      emailRedactionEnabled: true,
      showFilteredCount: true,
      securityBlockingEnabled: true,
      financialBlockingEnabled: true,
      sensitiveSenderBlockingEnabled: true,
      dollarAmountRedactionEnabled: true,
      attachmentFilteringEnabled: true,
      allowedFolders: [],
    });

    return c.json(
      {
        id: connId,
        email,
        provider: "gas",
        displayName: body.displayName || null,
        status: "active",
        createdAt: now,
      },
      201,
    );
  });

  // GET /api/connections/:id — Get one connection
  api.get("/connections/:id", async (c) => {
    const accountId = c.get("accountId");
    const conn = await storage.getConnection(c.req.param("id"));
    if (!conn || conn.accountId !== accountId) {
      return c.json({ error: "Connection not found" }, 404);
    }
    return c.json({
      id: conn.id,
      email: conn.email,
      provider: conn.provider,
      displayName: conn.displayName,
      status: conn.status,
      createdAt: conn.createdAt,
    });
  });

  // PATCH /api/connections/:id — Update display name
  api.patch("/connections/:id", async (c) => {
    const accountId = c.get("accountId");
    const conn = await storage.getConnection(c.req.param("id"));
    if (!conn || conn.accountId !== accountId) {
      return c.json({ error: "Connection not found" }, 404);
    }

    const body = await c.req.json<{ displayName?: string }>();
    if (body.displayName !== undefined) {
      await storage.updateConnectionDisplayName(conn.id, body.displayName || null);
      const updated = await storage.getConnection(conn.id);
      return c.json({
        id: updated!.id,
        email: updated!.email,
        provider: updated!.provider,
        displayName: updated!.displayName,
        status: updated!.status,
        createdAt: updated!.createdAt,
      });
    }

    return c.json({ error: "No valid fields to update" }, 400);
  });

  // DELETE /api/connections/:id — Disconnect (cascades to keys + filters)
  api.delete("/connections/:id", async (c) => {
    const accountId = c.get("accountId");
    const conn = await storage.getConnection(c.req.param("id"));
    if (!conn || conn.accountId !== accountId) {
      return c.json({ error: "Connection not found" }, 404);
    }
    await storage.deleteConnection(conn.id);
    return c.json({ success: true });
  });

  // GET /api/connections/:id/keys — List API keys for connection
  api.get("/connections/:id/keys", async (c) => {
    const accountId = c.get("accountId");
    const conn = await storage.getConnection(c.req.param("id"));
    if (!conn || conn.accountId !== accountId) {
      return c.json({ error: "Connection not found" }, 404);
    }

    const keys = await storage.listApiKeysForConnection(conn.id);
    return c.json(
      keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
      })),
    );
  });

  // POST /api/connections/:id/keys — Create API key (returns full key once)
  api.post("/connections/:id/keys", async (c) => {
    const accountId = c.get("accountId");
    const conn = await storage.getConnection(c.req.param("id"));
    if (!conn || conn.accountId !== accountId) {
      return c.json({ error: "Connection not found" }, 404);
    }

    const body = await c.req.json<{ name: string }>();
    if (!body.name?.trim()) {
      return c.json({ error: "name is required" }, 400);
    }

    const { key, record } = await createApiKey(
      storage,
      conn.id,
      accountId,
      body.name.trim(),
    );

    return c.json(
      {
        id: record.id,
        name: record.name,
        prefix: record.prefix,
        key, // full key — only shown once
        createdAt: record.createdAt,
      },
      201,
    );
  });

  // DELETE /api/connections/:id/keys/:keyId — Revoke API key
  api.delete("/connections/:id/keys/:keyId", async (c) => {
    const accountId = c.get("accountId");
    const conn = await storage.getConnection(c.req.param("id"));
    if (!conn || conn.accountId !== accountId) {
      return c.json({ error: "Connection not found" }, 404);
    }

    // Verify the key belongs to this connection
    const keys = await storage.listApiKeysForConnection(conn.id);
    const key = keys.find((k) => k.id === c.req.param("keyId"));
    if (!key) {
      return c.json({ error: "API key not found" }, 404);
    }

    await storage.revokeApiKey(key.id);
    return c.json({ success: true });
  });

  // GET /api/connections/:id/filters — Get filter config
  api.get("/connections/:id/filters", async (c) => {
    const accountId = c.get("accountId");
    const conn = await storage.getConnection(c.req.param("id"));
    if (!conn || conn.accountId !== accountId) {
      return c.json({ error: "Connection not found" }, 404);
    }

    const config = await storage.getFilterConfig(conn.id);
    if (!config) {
      // Return defaults
      return c.json({
        connectionId: conn.id,
        blockedDomains: [],
        blockedSenderPatterns: [],
        blockedSubjectPatterns: [],
        piiRedactionEnabled: true,
        injectionDetectionEnabled: true,
        emailRedactionEnabled: true,
        showFilteredCount: true,
        securityBlockingEnabled: true,
        financialBlockingEnabled: true,
        sensitiveSenderBlockingEnabled: true,
        dollarAmountRedactionEnabled: true,
        attachmentFilteringEnabled: true,
        allowedFolders: [],
      });
    }
    return c.json(config);
  });

  // PUT /api/connections/:id/filters — Update filter config
  api.put("/connections/:id/filters", async (c) => {
    const accountId = c.get("accountId");
    const conn = await storage.getConnection(c.req.param("id"));
    if (!conn || conn.accountId !== accountId) {
      return c.json({ error: "Connection not found" }, 404);
    }

    const body = await c.req.json<{
      blockedDomains?: string[];
      blockedSenderPatterns?: string[];
      blockedSubjectPatterns?: string[];
      piiRedactionEnabled?: boolean;
      injectionDetectionEnabled?: boolean;
      emailRedactionEnabled?: boolean;
      showFilteredCount?: boolean;
      securityBlockingEnabled?: boolean;
      financialBlockingEnabled?: boolean;
      sensitiveSenderBlockingEnabled?: boolean;
      dollarAmountRedactionEnabled?: boolean;
      attachmentFilteringEnabled?: boolean;
      allowedFolders?: string[];
    }>();

    // Validate string arrays contain only strings with reasonable length
    for (const field of ["blockedDomains", "blockedSenderPatterns", "blockedSubjectPatterns", "allowedFolders"] as const) {
      const arr = body[field];
      if (arr !== undefined) {
        if (!Array.isArray(arr) || arr.some((v) => typeof v !== "string" || v.length > 500)) {
          return c.json({ error: `${field} must be an array of strings (max 500 chars each)` }, 400);
        }
        if (arr.length > 200) {
          return c.json({ error: `${field} must have at most 200 entries` }, 400);
        }
      }
    }

    // Validate regex patterns are valid
    for (const field of ["blockedSenderPatterns", "blockedSubjectPatterns"] as const) {
      const arr = body[field];
      if (arr) {
        for (const pattern of arr) {
          try {
            new RegExp(pattern, "i");
          } catch {
            return c.json({ error: `Invalid regex pattern in ${field}: ${pattern}` }, 400);
          }
        }
      }
    }

    const existing = await storage.getFilterConfig(conn.id);
    const merged = {
      connectionId: conn.id,
      blockedDomains: body.blockedDomains ?? existing?.blockedDomains ?? [],
      blockedSenderPatterns:
        body.blockedSenderPatterns ?? existing?.blockedSenderPatterns ?? [],
      blockedSubjectPatterns:
        body.blockedSubjectPatterns ?? existing?.blockedSubjectPatterns ?? [],
      piiRedactionEnabled:
        body.piiRedactionEnabled ?? existing?.piiRedactionEnabled ?? true,
      injectionDetectionEnabled:
        body.injectionDetectionEnabled ??
        existing?.injectionDetectionEnabled ??
        true,
      emailRedactionEnabled:
        body.emailRedactionEnabled ?? existing?.emailRedactionEnabled ?? true,
      showFilteredCount:
        body.showFilteredCount ?? existing?.showFilteredCount ?? true,
      securityBlockingEnabled:
        body.securityBlockingEnabled ?? existing?.securityBlockingEnabled ?? true,
      financialBlockingEnabled:
        body.financialBlockingEnabled ?? existing?.financialBlockingEnabled ?? true,
      sensitiveSenderBlockingEnabled:
        body.sensitiveSenderBlockingEnabled ?? existing?.sensitiveSenderBlockingEnabled ?? true,
      dollarAmountRedactionEnabled:
        body.dollarAmountRedactionEnabled ?? existing?.dollarAmountRedactionEnabled ?? true,
      attachmentFilteringEnabled:
        body.attachmentFilteringEnabled ?? existing?.attachmentFilteringEnabled ?? true,
      allowedFolders:
        body.allowedFolders ?? existing?.allowedFolders ?? [],
    };

    await storage.upsertFilterConfig(merged);
    return c.json(merged);
  });

  return api;
}

const BLOCKED_HOST_PATTERN =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|0\.0\.0\.0|\[::1\])$/i;

function validateGasUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return "URL must use HTTPS";
    }
    const host = parsed.hostname;
    if (
      host !== "script.google.com" &&
      !host.endsWith(".script.google.com") &&
      host !== "script.googleusercontent.com" &&
      !host.endsWith(".script.googleusercontent.com")
    ) {
      return "URL must be on script.google.com or script.googleusercontent.com";
    }
    return null;
  } catch {
    return "Invalid URL";
  }
}

function validateImapInput(host: string, port: number): string | null {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "Port must be an integer between 1 and 65535";
  }
  if (BLOCKED_HOST_PATTERN.test(host)) {
    return "Internal/private hosts are not allowed";
  }
  return null;
}
