import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { nanoid } from "nanoid";

const CONFIG_FILE = join(homedir(), ".agentcloak", "config.json");

function loadConfig(): { serverUrl: string; apiKey?: string } {
  if (!existsSync(CONFIG_FILE)) {
    console.error("Config not found. Run 'agentcloak setup' first.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

export const connectCommand = new Command("connect")
  .description("Connect an email provider")
  .argument("<provider>", "Email provider (gmail)")
  .option("--user-id <id>", "User ID (auto-generated if not provided)")
  .action(async (provider: string, options: { userId?: string }) => {
    if (provider !== "gmail") {
      console.error(`Unsupported provider: ${provider}. Currently only 'gmail' is supported.`);
      process.exit(1);
    }

    const config = loadConfig();
    const userId = options.userId ?? nanoid(21);

    const url = `${config.serverUrl}/auth/gmail?user_id=${encodeURIComponent(userId)}`;

    console.log(`\nOpen this URL in your browser to connect Gmail:\n`);
    console.log(`  ${url}\n`);
    console.log(`User ID: ${userId}`);
    console.log(`\nAfter authorizing, you can create an API key with:`);
    console.log(`  agentcloak keys create my-agent --user-id ${userId}`);

    // Try to open browser automatically
    const { exec } = await import("node:child_process");
    exec(`open "${url}" 2>/dev/null || xdg-open "${url}" 2>/dev/null`);
  });
