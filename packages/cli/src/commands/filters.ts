import { Command } from "commander";
import Database from "better-sqlite3";

function getDbPath(): string {
  return process.env.DATABASE_PATH ?? "data/agentcloak.db";
}

export const filtersCommand = new Command("filters")
  .description("Manage content filters");

filtersCommand
  .command("show")
  .description("Show current filter configuration")
  .requiredOption("--user-id <id>", "User ID")
  .action((options: { userId: string }) => {
    const db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");

    const row = db
      .prepare("SELECT * FROM filter_configs WHERE user_id = ?")
      .get(options.userId) as Record<string, unknown> | undefined;

    if (!row) {
      console.log("No filter config found for this user. Using defaults.");
      return;
    }

    console.log(`\nFilter Configuration for user ${options.userId}:\n`);
    console.log(`  PII Redaction: ${row.pii_redaction_enabled ? "enabled" : "disabled"}`);
    console.log(`  Injection Detection: ${row.injection_detection_enabled ? "enabled" : "disabled"}`);

    const domains = JSON.parse(row.blocked_domains_json as string) as string[];
    const senders = JSON.parse(row.blocked_sender_patterns_json as string) as string[];
    const subjects = JSON.parse(row.blocked_subject_patterns_json as string) as string[];

    if (domains.length > 0) {
      console.log(`\n  Custom Blocked Domains:`);
      for (const d of domains) console.log(`    - ${d}`);
    }
    if (senders.length > 0) {
      console.log(`\n  Custom Blocked Sender Patterns:`);
      for (const s of senders) console.log(`    - ${s}`);
    }
    if (subjects.length > 0) {
      console.log(`\n  Custom Blocked Subject Patterns:`);
      for (const s of subjects) console.log(`    - ${s}`);
    }

    console.log(`\n  (Default blocklists are always active in addition to custom rules)`);
    db.close();
  });

filtersCommand
  .command("add-domain")
  .description("Add a domain to the blocklist")
  .argument("<domain>", "Domain to block (e.g., example.com)")
  .requiredOption("--user-id <id>", "User ID")
  .action((domain: string, options: { userId: string }) => {
    const db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");

    const row = db
      .prepare("SELECT blocked_domains_json FROM filter_configs WHERE user_id = ?")
      .get(options.userId) as Record<string, unknown> | undefined;

    if (!row) {
      // Create new config
      db.prepare(
        `INSERT INTO filter_configs (user_id, blocked_domains_json, blocked_sender_patterns_json, blocked_subject_patterns_json, pii_redaction_enabled, injection_detection_enabled)
         VALUES (?, ?, '[]', '[]', 1, 1)`,
      ).run(options.userId, JSON.stringify([domain]));
    } else {
      const domains = JSON.parse(row.blocked_domains_json as string) as string[];
      if (domains.includes(domain)) {
        console.log(`Domain ${domain} is already blocked.`);
        db.close();
        return;
      }
      domains.push(domain);
      db.prepare(
        "UPDATE filter_configs SET blocked_domains_json = ? WHERE user_id = ?",
      ).run(JSON.stringify(domains), options.userId);
    }

    console.log(`Added ${domain} to blocked domains.`);
    db.close();
  });

filtersCommand
  .command("add-subject")
  .description("Add a subject pattern to the blocklist")
  .argument("<pattern>", "Regex pattern to match against subjects")
  .requiredOption("--user-id <id>", "User ID")
  .action((pattern: string, options: { userId: string }) => {
    const db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");

    // Validate regex
    try {
      new RegExp(pattern, "i");
    } catch {
      console.error(`Invalid regex pattern: ${pattern}`);
      process.exit(1);
    }

    const row = db
      .prepare("SELECT blocked_subject_patterns_json FROM filter_configs WHERE user_id = ?")
      .get(options.userId) as Record<string, unknown> | undefined;

    if (!row) {
      db.prepare(
        `INSERT INTO filter_configs (user_id, blocked_domains_json, blocked_sender_patterns_json, blocked_subject_patterns_json, pii_redaction_enabled, injection_detection_enabled)
         VALUES (?, '[]', '[]', ?, 1, 1)`,
      ).run(options.userId, JSON.stringify([pattern]));
    } else {
      const patterns = JSON.parse(row.blocked_subject_patterns_json as string) as string[];
      if (patterns.includes(pattern)) {
        console.log(`Subject pattern '${pattern}' is already in the blocklist.`);
        db.close();
        return;
      }
      patterns.push(pattern);
      db.prepare(
        "UPDATE filter_configs SET blocked_subject_patterns_json = ? WHERE user_id = ?",
      ).run(JSON.stringify(patterns), options.userId);
    }

    console.log(`Added subject pattern '${pattern}' to blocklist.`);
    db.close();
  });
