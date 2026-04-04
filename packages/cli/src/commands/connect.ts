import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_FILE = join(homedir(), ".agentcloak", "config.json");

function loadConfig(): { serverUrl: string; apiKey?: string } {
  if (!existsSync(CONFIG_FILE)) {
    console.error("Config not found. Run 'agentcloak setup' first.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

export const connectCommand = new Command("connect")
  .description("Connect an email provider (opens dashboard login)")
  .argument("<provider>", "Email provider (gmail)")
  .action(async (provider: string) => {
    if (provider !== "gmail") {
      console.error(
        `Unsupported provider: ${provider}. Currently only 'gmail' is supported.`,
      );
      process.exit(1);
    }

    const config = loadConfig();
    const url = `${config.serverUrl}/auth/login`;

    console.log(`\nOpen this URL in your browser to log in and connect Gmail:\n`);
    console.log(`  ${url}\n`);
    console.log(`After logging in, use the dashboard to:`);
    console.log(`  1. Connect your Gmail account`);
    console.log(`  2. Create an API key for a connection`);
    console.log(`  3. Add the MCP server to Claude Code\n`);

    // Try to open browser automatically
    const { exec } = await import("node:child_process");
    exec(`open "${url}" 2>/dev/null || xdg-open "${url}" 2>/dev/null`);
  });
