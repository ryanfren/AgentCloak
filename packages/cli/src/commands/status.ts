import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_FILE = join(homedir(), ".agentcloak", "config.json");

export const statusCommand = new Command("status")
  .description("Check AgentCloak server status")
  .action(async () => {
    let serverUrl = "http://localhost:3000";

    if (existsSync(CONFIG_FILE)) {
      const config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      serverUrl = config.serverUrl ?? serverUrl;
    }

    console.log(`Checking AgentCloak server at ${serverUrl}...\n`);

    try {
      const res = await fetch(`${serverUrl}/health`);
      const data = await res.json() as { status: string; version: string };
      console.log(`  Status:  ${data.status}`);
      console.log(`  Version: ${data.version}`);
    } catch (err) {
      console.error(`  Server unreachable at ${serverUrl}`);
      console.error(`  Make sure the server is running: pnpm dev`);
      process.exit(1);
    }
  });
