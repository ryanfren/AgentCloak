import { Command } from "commander";
import Database from "better-sqlite3";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { createInterface } from "node:readline";

function getDbPath(options: { db?: string }): string {
  return options.db ?? process.env.DATABASE_PATH ?? "data/agentcloak.db";
}

// Duplicate scrypt helpers from server to avoid cross-package dependency
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 32;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, opts, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (hidden && process.stdin.isTTY) {
      // Mask input for password prompts
      process.stdout.write(question);
      const stdin = process.stdin;
      const originalRawMode = stdin.isRaw;
      stdin.setRawMode(true);
      stdin.resume();

      let input = "";
      const onData = (char: Buffer) => {
        const c = char.toString("utf8");
        if (c === "\n" || c === "\r") {
          stdin.setRawMode(originalRawMode ?? false);
          stdin.removeListener("data", onData);
          stdin.pause();
          process.stdout.write("\n");
          rl.close();
          resolve(input);
        } else if (c === "\u0003") {
          // Ctrl+C
          process.exit(1);
        } else if (c === "\u007F" || c === "\b") {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else {
          input += c;
        }
      };
      stdin.on("data", onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

export const resetPasswordCommand = new Command("reset-password")
  .description("Reset password for an email/password account")
  .requiredOption("--email <email>", "Account email address")
  .option("--db <path>", "Path to SQLite database")
  .action(async (options: { email: string; db?: string }) => {
    const dbPath = getDbPath(options);
    let db: Database.Database;
    try {
      db = new Database(dbPath);
    } catch {
      console.error(`Error: Could not open database at ${dbPath}`);
      process.exit(1);
    }

    db.pragma("journal_mode = WAL");

    // Verify account exists
    const account = db
      .prepare("SELECT id, email, name FROM accounts WHERE email = ?")
      .get(options.email) as
      | { id: string; email: string; name: string | null }
      | undefined;

    if (!account) {
      console.error(`Error: No account found with email ${options.email}`);
      db.close();
      process.exit(1);
    }

    console.log(`\nResetting password for: ${account.email}`);
    if (account.name) console.log(`  Account name: ${account.name}`);

    // Prompt for new password
    const password1 = await prompt("New password: ", true);
    if (password1.length < 8) {
      console.error("Error: Password must be at least 8 characters");
      db.close();
      process.exit(1);
    }

    const password2 = await prompt("Confirm password: ", true);
    if (password1 !== password2) {
      console.error("Error: Passwords do not match");
      db.close();
      process.exit(1);
    }

    // Hash and update
    const passwordHash = await hashPassword(password1);
    db.prepare(
      "UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?",
    ).run(passwordHash, Date.now(), account.id);

    // Invalidate all sessions for this account
    const result = db
      .prepare("DELETE FROM sessions WHERE account_id = ?")
      .run(account.id);
    console.log(`\nPassword updated successfully.`);
    if (result.changes > 0) {
      console.log(
        `Cleared ${result.changes} active session(s) — user will need to log in again.`,
      );
    }

    db.close();
  });
