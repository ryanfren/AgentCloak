import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  OAuthTokens,
  Storage,
  StoredApiKey,
  StoredFilterConfig,
  StoredUser,
} from "./types.js";

export class SqliteStorage implements Storage {
  private db: Database.Database;

  constructor(dbPath: string, encryptionKey?: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);

    if (encryptionKey) {
      this.db.pragma(`key = '${encryptionKey}'`);
    }

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  async init(): Promise<void> {
    // Migrate: add columns if missing
    this.migrateFilterConfigs();

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        provider TEXT NOT NULL,
        tokens_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(email, provider)
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        revoked_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS filter_configs (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        blocked_domains_json TEXT NOT NULL DEFAULT '[]',
        blocked_sender_patterns_json TEXT NOT NULL DEFAULT '[]',
        blocked_subject_patterns_json TEXT NOT NULL DEFAULT '[]',
        pii_redaction_enabled INTEGER NOT NULL DEFAULT 1,
        injection_detection_enabled INTEGER NOT NULL DEFAULT 1,
        email_redaction_enabled INTEGER NOT NULL DEFAULT 1,
        show_filtered_count INTEGER NOT NULL DEFAULT 1
      );
    `);
  }

  private migrateFilterConfigs(): void {
    try {
      const tableInfo = this.db.pragma("table_info(filter_configs)") as Array<{ name: string }>;
      if (tableInfo.length === 0) return;
      const columns = new Set(tableInfo.map((col) => col.name));
      if (!columns.has("show_filtered_count")) {
        this.db.exec("ALTER TABLE filter_configs ADD COLUMN show_filtered_count INTEGER NOT NULL DEFAULT 1");
      }
      if (!columns.has("email_redaction_enabled")) {
        this.db.exec("ALTER TABLE filter_configs ADD COLUMN email_redaction_enabled INTEGER NOT NULL DEFAULT 1");
      }
    } catch {
      // Table doesn't exist yet, will be created in init
    }
  }

  // Users
  async getUser(userId: string): Promise<StoredUser | null> {
    const row = this.db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(userId) as Record<string, unknown> | undefined;
    return row ? this.rowToUser(row) : null;
  }

  async getUserByEmail(
    email: string,
    provider: string,
  ): Promise<StoredUser | null> {
    const row = this.db
      .prepare("SELECT * FROM users WHERE email = ? AND provider = ?")
      .get(email, provider) as Record<string, unknown> | undefined;
    return row ? this.rowToUser(row) : null;
  }

  async upsertUser(user: StoredUser): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO users (id, email, provider, tokens_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(email, provider) DO UPDATE SET
         tokens_json = excluded.tokens_json,
         updated_at = excluded.updated_at`,
      )
      .run(
        user.id,
        user.email,
        user.provider,
        JSON.stringify(user.tokens),
        user.createdAt,
        user.updatedAt,
      );
  }

  async updateTokens(userId: string, tokens: OAuthTokens): Promise<void> {
    this.db
      .prepare(
        "UPDATE users SET tokens_json = ?, updated_at = ? WHERE id = ?",
      )
      .run(JSON.stringify(tokens), Date.now(), userId);
  }

  // API Keys
  async createApiKey(key: StoredApiKey): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO api_keys (id, user_id, name, key_hash, prefix, created_at, last_used_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        key.id,
        key.userId,
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
      .prepare("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
      .get(keyHash) as Record<string, unknown> | undefined;
    return row ? this.rowToApiKey(row) : null;
  }

  async listApiKeys(userId: string): Promise<StoredApiKey[]> {
    const rows = this.db
      .prepare("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as Record<string, unknown>[];
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

  // Filter Config
  async getFilterConfig(userId: string): Promise<StoredFilterConfig | null> {
    const row = this.db
      .prepare("SELECT * FROM filter_configs WHERE user_id = ?")
      .get(userId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      userId: row.user_id as string,
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
    };
  }

  async upsertFilterConfig(config: StoredFilterConfig): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO filter_configs (user_id, blocked_domains_json, blocked_sender_patterns_json, blocked_subject_patterns_json, pii_redaction_enabled, injection_detection_enabled, email_redaction_enabled, show_filtered_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         blocked_domains_json = excluded.blocked_domains_json,
         blocked_sender_patterns_json = excluded.blocked_sender_patterns_json,
         blocked_subject_patterns_json = excluded.blocked_subject_patterns_json,
         pii_redaction_enabled = excluded.pii_redaction_enabled,
         injection_detection_enabled = excluded.injection_detection_enabled,
         email_redaction_enabled = excluded.email_redaction_enabled,
         show_filtered_count = excluded.show_filtered_count`,
      )
      .run(
        config.userId,
        JSON.stringify(config.blockedDomains),
        JSON.stringify(config.blockedSenderPatterns),
        JSON.stringify(config.blockedSubjectPatterns),
        config.piiRedactionEnabled ? 1 : 0,
        config.injectionDetectionEnabled ? 1 : 0,
        config.emailRedactionEnabled ? 1 : 0,
        config.showFilteredCount ? 1 : 0,
      );
  }

  private rowToUser(row: Record<string, unknown>): StoredUser {
    return {
      id: row.id as string,
      email: row.email as string,
      provider: row.provider as string,
      tokens: JSON.parse(row.tokens_json as string),
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  private rowToApiKey(row: Record<string, unknown>): StoredApiKey {
    return {
      id: row.id as string,
      userId: row.user_id as string,
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
