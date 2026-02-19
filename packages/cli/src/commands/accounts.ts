import { Command } from "commander";
import Database from "better-sqlite3";

function getDbPath(): string {
  return process.env.DATABASE_PATH ?? "data/agentcloak.db";
}

export const accountsCommand = new Command("accounts").description(
  "View registered accounts",
);

accountsCommand
  .command("list")
  .description("List all accounts with connection counts")
  .option("--email <email>", "Filter by email address")
  .action((options: { email?: string }) => {
    const db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");

    const query = `
      SELECT
        a.id,
        a.email,
        a.name,
        a.created_at,
        COUNT(c.id) AS connections
      FROM accounts a
      LEFT JOIN email_connections c ON c.account_id = a.id
      ${options.email ? "WHERE a.email = ?" : ""}
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `;

    const rows = (
      options.email ? db.prepare(query).all(options.email) : db.prepare(query).all()
    ) as Array<{
      id: string;
      email: string;
      name: string | null;
      created_at: number;
      connections: number;
    }>;

    if (rows.length === 0) {
      console.log("No accounts found.");
      db.close();
      return;
    }

    console.log(`\n${rows.length} account${rows.length === 1 ? "" : "s"}:\n`);
    for (const row of rows) {
      const created = new Date(row.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const name = row.name ? ` (${row.name})` : "";
      const conns =
        row.connections === 0
          ? "no connections"
          : row.connections === 1
            ? "1 connection"
            : `${row.connections} connections`;
      console.log(`  ${row.email}${name}`);
      console.log(`    Created: ${created}  |  ${conns}`);
    }
    console.log();

    db.close();
  });
