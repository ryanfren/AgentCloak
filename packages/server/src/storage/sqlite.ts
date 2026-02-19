import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ConnectionCredentials,
  ConnectionStatus,
  Storage,
  StoredAccount,
  StoredApiKey,
  StoredEmailConnection,
  StoredFilterConfig,
  StoredSession,
} from "./types.js";

const CURRENT_SCHEMA_VERSION = 5;

export class SqliteStorage implements Storage {
  private db: Database.Database;

  constructor(dbPath: string, encryptionKey?: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);

    if (encryptionKey) {
      const sanitized = encryptionKey.replace(/'/g, "''");
      this.db.pragma(`key = '${sanitized}'`);
    }

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  async init(): Promise<void> {
    const version = this.getSchemaVersion();

    if (version === 0 && this.hasTable("users")) {
      // Old schema exists — run migration
      this.migrateFromV1();
      this.migrateFromV2ToV3();
      this.migrateFromV3ToV4();
      this.migrateFromV4ToV5();
    } else if (version === 0) {
      // Fresh install — create new schema directly
      this.createSchemaV5();
    } else if (version <= 2) {
      this.migrateFromV2ToV3();
      this.migrateFromV3ToV4();
      this.migrateFromV4ToV5();
    } else if (version === 3) {
      this.migrateFromV3ToV4();
      this.migrateFromV4ToV5();
    } else if (version === 4) {
      this.migrateFromV4ToV5();
    }
    // version >= 5: already up to date
  }

  private getSchemaVersion(): number {
    if (!this.hasTable("schema_version")) return 0;
    const row = this.db
      .prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
      .get() as { version: number } | undefined;
    return row?.version ?? 0;
  }

  private setSchemaVersion(version: number): void {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)",
    );
    this.db
      .prepare(
        "INSERT INTO schema_version (version) VALUES (?) ON CONFLICT(version) DO NOTHING",
      )
      .run(version);
  }

  private hasTable(name: string): boolean {
    const row = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get(name) as { name: string } | undefined;
    return !!row;
  }

  private createSchemaV5(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        avatar_url TEXT,
        password_hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS email_connections (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        provider TEXT NOT NULL,
        display_name TEXT,
        tokens_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_keys (
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

      CREATE TABLE IF NOT EXISTS filter_configs (
        connection_id TEXT PRIMARY KEY REFERENCES email_connections(id) ON DELETE CASCADE,
        blocked_domains_json TEXT NOT NULL DEFAULT '[]',
        blocked_sender_patterns_json TEXT NOT NULL DEFAULT '[]',
        blocked_subject_patterns_json TEXT NOT NULL DEFAULT '[]',
        pii_redaction_enabled INTEGER NOT NULL DEFAULT 1,
        injection_detection_enabled INTEGER NOT NULL DEFAULT 1,
        email_redaction_enabled INTEGER NOT NULL DEFAULT 1,
        show_filtered_count INTEGER NOT NULL DEFAULT 1,
        security_blocking_enabled INTEGER NOT NULL DEFAULT 1,
        financial_blocking_enabled INTEGER NOT NULL DEFAULT 1,
        sensitive_sender_blocking_enabled INTEGER NOT NULL DEFAULT 1,
        dollar_amount_redaction_enabled INTEGER NOT NULL DEFAULT 1,
        attachment_filtering_enabled INTEGER NOT NULL DEFAULT 1,
        allowed_folders_json TEXT NOT NULL DEFAULT '[]'
      );
    `);
    this.setSchemaVersion(CURRENT_SCHEMA_VERSION);
  }

  private migrateFromV1(): void {
    // Migrate old users/api_keys/filter_configs to new schema
    // Old users.id becomes both accounts.id and email_connections.id
    const migrate = this.db.transaction(() => {
      // Ensure old filter_configs columns exist before migration
      this.migrateFilterConfigColumns();

      // Create new tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT,
          avatar_url TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS email_connections (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          provider TEXT NOT NULL,
          display_name TEXT,
          tokens_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(email, provider)
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);

      // Migrate users → accounts + email_connections
      const users = this.db
        .prepare("SELECT * FROM users")
        .all() as Record<string, unknown>[];

      for (const user of users) {
        // Create account (same id as old user)
        this.db
          .prepare(
            `INSERT OR IGNORE INTO accounts (id, email, name, avatar_url, created_at, updated_at)
             VALUES (?, ?, NULL, NULL, ?, ?)`,
          )
          .run(
            user.id,
            user.email,
            user.created_at,
            user.updated_at,
          );

        // Create email connection (same id as old user)
        this.db
          .prepare(
            `INSERT OR IGNORE INTO email_connections (id, account_id, email, provider, display_name, tokens_json, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, NULL, ?, 'active', ?, ?)`,
          )
          .run(
            user.id,
            user.id,
            user.email,
            user.provider,
            user.tokens_json,
            user.created_at,
            user.updated_at,
          );
      }

      // Recreate api_keys with new schema
      this.db.exec(`
        CREATE TABLE api_keys_new (
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
      `);

      // Migrate api keys: user_id maps to both connection_id and account_id
      this.db.exec(`
        INSERT INTO api_keys_new (id, connection_id, account_id, name, key_hash, prefix, created_at, last_used_at, revoked_at)
        SELECT id, user_id, user_id, name, key_hash, prefix, created_at, last_used_at, revoked_at
        FROM api_keys;
      `);

      this.db.exec("DROP TABLE api_keys");
      this.db.exec("ALTER TABLE api_keys_new RENAME TO api_keys");

      // Recreate filter_configs with new schema
      this.db.exec(`
        CREATE TABLE filter_configs_new (
          connection_id TEXT PRIMARY KEY REFERENCES email_connections(id) ON DELETE CASCADE,
          blocked_domains_json TEXT NOT NULL DEFAULT '[]',
          blocked_sender_patterns_json TEXT NOT NULL DEFAULT '[]',
          blocked_subject_patterns_json TEXT NOT NULL DEFAULT '[]',
          pii_redaction_enabled INTEGER NOT NULL DEFAULT 1,
          injection_detection_enabled INTEGER NOT NULL DEFAULT 1,
          email_redaction_enabled INTEGER NOT NULL DEFAULT 1,
          show_filtered_count INTEGER NOT NULL DEFAULT 1
        );
      `);

      // Migrate filter configs: user_id maps to connection_id
      this.db.exec(`
        INSERT INTO filter_configs_new (connection_id, blocked_domains_json, blocked_sender_patterns_json, blocked_subject_patterns_json, pii_redaction_enabled, injection_detection_enabled, email_redaction_enabled, show_filtered_count)
        SELECT user_id, blocked_domains_json, blocked_sender_patterns_json, blocked_subject_patterns_json, pii_redaction_enabled, injection_detection_enabled, email_redaction_enabled, show_filtered_count
        FROM filter_configs;
      `);

      this.db.exec("DROP TABLE filter_configs");
      this.db.exec("ALTER TABLE filter_configs_new RENAME TO filter_configs");

      // Drop old users table
      this.db.exec("DROP TABLE users");

      // Set version inside transaction so migration is atomic
      this.setSchemaVersion(2);
    });

    migrate();
    console.log("Database migrated from v1 to v2 (accounts + email_connections)");
  }

  private migrateFilterConfigColumns(): void {
    try {
      const tableInfo = this.db.pragma("table_info(filter_configs)") as Array<{
        name: string;
      }>;
      if (tableInfo.length === 0) return;
      const columns = new Set(tableInfo.map((col) => col.name));
      if (!columns.has("show_filtered_count")) {
        this.db.exec(
          "ALTER TABLE filter_configs ADD COLUMN show_filtered_count INTEGER NOT NULL DEFAULT 1",
        );
      }
      if (!columns.has("email_redaction_enabled")) {
        this.db.exec(
          "ALTER TABLE filter_configs ADD COLUMN email_redaction_enabled INTEGER NOT NULL DEFAULT 1",
        );
      }
    } catch {
      // Table doesn't exist yet
    }
  }

  private migrateFromV2ToV3(): void {
    const migrate = this.db.transaction(() => {
      const tableInfo = this.db.pragma("table_info(filter_configs)") as Array<{
        name: string;
      }>;
      const columns = new Set(tableInfo.map((col) => col.name));
      const addIfMissing = (col: string, def: string) => {
        if (!columns.has(col)) {
          this.db.exec(
            `ALTER TABLE filter_configs ADD COLUMN ${col} ${def}`,
          );
        }
      };
      addIfMissing("security_blocking_enabled", "INTEGER NOT NULL DEFAULT 1");
      addIfMissing("financial_blocking_enabled", "INTEGER NOT NULL DEFAULT 1");
      addIfMissing("sensitive_sender_blocking_enabled", "INTEGER NOT NULL DEFAULT 1");
      addIfMissing("dollar_amount_redaction_enabled", "INTEGER NOT NULL DEFAULT 1");
      addIfMissing("attachment_filtering_enabled", "INTEGER NOT NULL DEFAULT 1");
      addIfMissing("allowed_folders_json", "TEXT NOT NULL DEFAULT '[]'");
      this.setSchemaVersion(3);
    });

    migrate();
    console.log("Database migrated from v2 to v3 (filter category toggles)");
  }

  private migrateFromV3ToV4(): void {
    const migrate = this.db.transaction(() => {
      const tableInfo = this.db.pragma("table_info(accounts)") as Array<{
        name: string;
      }>;
      const columns = new Set(tableInfo.map((col) => col.name));
      if (!columns.has("password_hash")) {
        this.db.exec("ALTER TABLE accounts ADD COLUMN password_hash TEXT");
      }
      this.setSchemaVersion(CURRENT_SCHEMA_VERSION);
    });

    migrate();
    console.log("Database migrated from v3 to v4 (password_hash column)");
  }

  private migrateFromV4ToV5(): void {
    this.db.transaction(() => {
      // Recreate email_connections without UNIQUE(email, provider)
      this.db.exec(`
        CREATE TABLE email_connections_new (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          provider TEXT NOT NULL,
          display_name TEXT,
          tokens_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        INSERT INTO email_connections_new SELECT * FROM email_connections;
        DROP TABLE email_connections;
        ALTER TABLE email_connections_new RENAME TO email_connections;
      `);
      this.setSchemaVersion(5);
    })();
    console.log("Database migrated from v4 to v5 (allow duplicate email+provider)");
  }

  // ── Accounts ──

  async getAccount(id: string): Promise<StoredAccount | null> {
    const row = this.db
      .prepare("SELECT * FROM accounts WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToAccount(row) : null;
  }

  async getAccountByEmail(email: string): Promise<StoredAccount | null> {
    const row = this.db
      .prepare("SELECT * FROM accounts WHERE email = ?")
      .get(email) as Record<string, unknown> | undefined;
    return row ? this.rowToAccount(row) : null;
  }

  async upsertAccount(account: StoredAccount): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO accounts (id, email, name, avatar_url, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           name = excluded.name,
           avatar_url = excluded.avatar_url,
           password_hash = COALESCE(excluded.password_hash, accounts.password_hash),
           updated_at = excluded.updated_at`,
      )
      .run(
        account.id,
        account.email,
        account.name,
        account.avatarUrl,
        account.passwordHash,
        account.createdAt,
        account.updatedAt,
      );
  }

  async updateAccountPasswordHash(
    id: string,
    passwordHash: string,
  ): Promise<void> {
    this.db
      .prepare(
        "UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?",
      )
      .run(passwordHash, Date.now(), id);
  }

  // ── Email Connections ──

  async getConnection(id: string): Promise<StoredEmailConnection | null> {
    const row = this.db
      .prepare("SELECT * FROM email_connections WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToConnection(row) : null;
  }

  async listConnections(accountId: string): Promise<StoredEmailConnection[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM email_connections WHERE account_id = ? ORDER BY created_at ASC",
      )
      .all(accountId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToConnection(r));
  }

  async createConnection(conn: StoredEmailConnection): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO email_connections (id, account_id, email, provider, display_name, tokens_json, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        conn.id,
        conn.accountId,
        conn.email,
        conn.provider,
        conn.displayName,
        JSON.stringify(conn.tokens),
        conn.status,
        conn.createdAt,
        conn.updatedAt,
      );
  }

  async updateConnectionTokens(
    id: string,
    tokens: ConnectionCredentials,
  ): Promise<void> {
    this.db
      .prepare(
        "UPDATE email_connections SET tokens_json = ?, updated_at = ? WHERE id = ?",
      )
      .run(JSON.stringify(tokens), Date.now(), id);
  }

  async updateConnectionStatus(
    id: string,
    status: ConnectionStatus,
  ): Promise<void> {
    this.db
      .prepare(
        "UPDATE email_connections SET status = ?, updated_at = ? WHERE id = ?",
      )
      .run(status, Date.now(), id);
  }

  async updateConnectionDisplayName(
    id: string,
    displayName: string | null,
  ): Promise<void> {
    this.db
      .prepare(
        "UPDATE email_connections SET display_name = ?, updated_at = ? WHERE id = ?",
      )
      .run(displayName, Date.now(), id);
  }

  async deleteConnection(id: string): Promise<void> {
    this.db.prepare("DELETE FROM email_connections WHERE id = ?").run(id);
  }

  // ── Sessions ──

  async createSession(session: StoredSession): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions (id, account_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(session.id, session.accountId, session.expiresAt, session.createdAt);
  }

  async getSession(id: string): Promise<StoredSession | null> {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > ?")
      .get(id, Date.now()) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      accountId: row.account_id as string,
      expiresAt: row.expires_at as number,
      createdAt: row.created_at as number,
    };
  }

  async deleteSession(id: string): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  async deleteExpiredSessions(): Promise<void> {
    this.db
      .prepare("DELETE FROM sessions WHERE expires_at <= ?")
      .run(Date.now());
  }

  async deleteAccountSessions(accountId: string): Promise<void> {
    this.db
      .prepare("DELETE FROM sessions WHERE account_id = ?")
      .run(accountId);
  }

  // ── API Keys ──

  async createApiKey(key: StoredApiKey): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO api_keys (id, connection_id, account_id, name, key_hash, prefix, created_at, last_used_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        key.id,
        key.connectionId,
        key.accountId,
        key.name,
        key.keyHash,
        key.prefix,
        key.createdAt,
        key.lastUsedAt,
        key.revokedAt,
      );
  }

  async getApiKeyByHash(keyHash: string): Promise<StoredApiKey | null> {
    const row = this.db
      .prepare(
        "SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
      )
      .get(keyHash) as Record<string, unknown> | undefined;
    return row ? this.rowToApiKey(row) : null;
  }

  async listApiKeys(accountId: string): Promise<StoredApiKey[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM api_keys WHERE account_id = ? ORDER BY created_at DESC",
      )
      .all(accountId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToApiKey(r));
  }

  async listApiKeysForConnection(
    connectionId: string,
  ): Promise<StoredApiKey[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM api_keys WHERE connection_id = ? ORDER BY created_at DESC",
      )
      .all(connectionId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToApiKey(r));
  }

  async revokeApiKey(keyId: string): Promise<void> {
    this.db
      .prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ?")
      .run(Date.now(), keyId);
  }

  async updateApiKeyLastUsed(keyId: string): Promise<void> {
    this.db
      .prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
      .run(Date.now(), keyId);
  }

  // ── Filter Config ──

  async getFilterConfig(
    connectionId: string,
  ): Promise<StoredFilterConfig | null> {
    const row = this.db
      .prepare("SELECT * FROM filter_configs WHERE connection_id = ?")
      .get(connectionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      connectionId: row.connection_id as string,
      blockedDomains: JSON.parse(row.blocked_domains_json as string),
      blockedSenderPatterns: JSON.parse(
        row.blocked_sender_patterns_json as string,
      ),
      blockedSubjectPatterns: JSON.parse(
        row.blocked_subject_patterns_json as string,
      ),
      piiRedactionEnabled: (row.pii_redaction_enabled as number) === 1,
      injectionDetectionEnabled:
        (row.injection_detection_enabled as number) === 1,
      emailRedactionEnabled: (row.email_redaction_enabled as number) === 1,
      showFilteredCount: (row.show_filtered_count as number) === 1,
      securityBlockingEnabled: (row.security_blocking_enabled as number) === 1,
      financialBlockingEnabled: (row.financial_blocking_enabled as number) === 1,
      sensitiveSenderBlockingEnabled: (row.sensitive_sender_blocking_enabled as number) === 1,
      dollarAmountRedactionEnabled: (row.dollar_amount_redaction_enabled as number) === 1,
      attachmentFilteringEnabled: (row.attachment_filtering_enabled as number) === 1,
      allowedFolders: JSON.parse(row.allowed_folders_json as string),
    };
  }

  async upsertFilterConfig(config: StoredFilterConfig): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO filter_configs (connection_id, blocked_domains_json, blocked_sender_patterns_json, blocked_subject_patterns_json, pii_redaction_enabled, injection_detection_enabled, email_redaction_enabled, show_filtered_count, security_blocking_enabled, financial_blocking_enabled, sensitive_sender_blocking_enabled, dollar_amount_redaction_enabled, attachment_filtering_enabled, allowed_folders_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(connection_id) DO UPDATE SET
           blocked_domains_json = excluded.blocked_domains_json,
           blocked_sender_patterns_json = excluded.blocked_sender_patterns_json,
           blocked_subject_patterns_json = excluded.blocked_subject_patterns_json,
           pii_redaction_enabled = excluded.pii_redaction_enabled,
           injection_detection_enabled = excluded.injection_detection_enabled,
           email_redaction_enabled = excluded.email_redaction_enabled,
           show_filtered_count = excluded.show_filtered_count,
           security_blocking_enabled = excluded.security_blocking_enabled,
           financial_blocking_enabled = excluded.financial_blocking_enabled,
           sensitive_sender_blocking_enabled = excluded.sensitive_sender_blocking_enabled,
           dollar_amount_redaction_enabled = excluded.dollar_amount_redaction_enabled,
           attachment_filtering_enabled = excluded.attachment_filtering_enabled,
           allowed_folders_json = excluded.allowed_folders_json`,
      )
      .run(
        config.connectionId,
        JSON.stringify(config.blockedDomains),
        JSON.stringify(config.blockedSenderPatterns),
        JSON.stringify(config.blockedSubjectPatterns),
        config.piiRedactionEnabled ? 1 : 0,
        config.injectionDetectionEnabled ? 1 : 0,
        config.emailRedactionEnabled ? 1 : 0,
        config.showFilteredCount ? 1 : 0,
        config.securityBlockingEnabled ? 1 : 0,
        config.financialBlockingEnabled ? 1 : 0,
        config.sensitiveSenderBlockingEnabled ? 1 : 0,
        config.dollarAmountRedactionEnabled ? 1 : 0,
        config.attachmentFilteringEnabled ? 1 : 0,
        JSON.stringify(config.allowedFolders),
      );
  }

  // ── Row mappers ──

  private rowToAccount(row: Record<string, unknown>): StoredAccount {
    return {
      id: row.id as string,
      email: row.email as string,
      name: (row.name as string) ?? null,
      avatarUrl: (row.avatar_url as string) ?? null,
      passwordHash: (row.password_hash as string) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  private rowToConnection(
    row: Record<string, unknown>,
  ): StoredEmailConnection {
    return {
      id: row.id as string,
      accountId: row.account_id as string,
      email: row.email as string,
      provider: row.provider as string,
      displayName: (row.display_name as string) ?? null,
      tokens: JSON.parse(row.tokens_json as string),
      status: row.status as ConnectionStatus,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  private rowToApiKey(row: Record<string, unknown>): StoredApiKey {
    return {
      id: row.id as string,
      connectionId: row.connection_id as string,
      accountId: row.account_id as string,
      name: row.name as string,
      keyHash: row.key_hash as string,
      prefix: row.prefix as string,
      createdAt: row.created_at as number,
      lastUsedAt: row.last_used_at as number | null,
      revokedAt: row.revoked_at as number | null,
    };
  }
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
