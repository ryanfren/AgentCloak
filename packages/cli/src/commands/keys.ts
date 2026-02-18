import { Command } from "commander";
import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_FILE = join(homedir(), ".agentcloak", "config.json");

function getDbPath(): string {
  return process.env.DATABASE_PATH ?? "data/agentcloak.db";
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export const keysCommand = new Command("keys")
  .description("Manage API keys");

keysCommand
  .command("create")
  .description("Create a new API key")
  .argument("<name>", "Name for this API key")
  .requiredOption("--user-id <id>", "User ID to associate with this key")
  .action((name: string, options: { userId: string }) => {
    const db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");

    const rawKey = nanoid(40);
    const key = `ac_${rawKey}`;
    const keyHash = hashKey(key);
    const prefix = key.slice(0, 8);
    const id = nanoid(21);

    db.prepare(
      `INSERT INTO api_keys (id, user_id, name, key_hash, prefix, created_at, last_used_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
    ).run(id, options.userId, name, keyHash, prefix, Date.now());

    console.log(`\nAPI key created successfully!\n`);
    console.log(`  Name:   ${name}`);
    console.log(`  Key:    ${key}`);
    console.log(`  Prefix: ${prefix}...`);
    console.log(`\nSave this key — it won't be shown again.\n`);
    console.log(`To use with Claude Code:`);
    console.log(`  claude mcp add --transport http agentcloak http://localhost:3000/mcp --header "Authorization: Bearer ${key}"`);

    db.close();
  });

keysCommand
  .command("list")
  .description("List all API keys")
  .option("--user-id <id>", "Filter by user ID")
  .action((options: { userId?: string }) => {
    const db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");

    let rows: Array<Record<string, unknown>>;
    if (options.userId) {
      rows = db
        .prepare("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC")
        .all(options.userId) as Array<Record<string, unknown>>;
    } else {
      rows = db
        .prepare("SELECT * FROM api_keys ORDER BY created_at DESC")
        .all() as Array<Record<string, unknown>>;
    }

    if (rows.length === 0) {
      console.log("No API keys found.");
      return;
    }

    console.log("\nAPI Keys:\n");
    for (const row of rows) {
      const status = row.revoked_at ? "REVOKED" : "ACTIVE";
      const lastUsed = row.last_used_at
        ? new Date(row.last_used_at as number).toISOString()
        : "Never";
      console.log(`  ${row.prefix}...  ${row.name}  [${status}]  Last used: ${lastUsed}`);
    }

    db.close();
  });

keysCommand
  .command("revoke")
  .description("Revoke an API key")
  .argument("<prefix>", "API key prefix (first 8 chars)")
  .action((prefix: string) => {
    const db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");

    const result = db
      .prepare("UPDATE api_keys SET revoked_at = ? WHERE prefix = ? AND revoked_at IS NULL")
      .run(Date.now(), prefix);

    if (result.changes === 0) {
      console.log("No active key found with that prefix.");
    } else {
      console.log(`Key ${prefix}... has been revoked.`);
    }

    db.close();
  });
