import { Command } from "commander";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

const CONFIG_DIR = join(homedir(), ".agentcloak");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export const setupCommand = new Command("setup")
  .description("Interactive setup for AgentCloak")
  .action(async () => {
    console.log("AgentCloak Setup\n");

    if (existsSync(CONFIG_FILE)) {
      const overwrite = await prompt("Config already exists. Overwrite? (y/N): ");
      if (overwrite.toLowerCase() !== "y") {
        console.log("Setup cancelled.");
        return;
      }
    }

    const serverUrl = await prompt("Server URL (default: http://localhost:3000): ") || "http://localhost:3000";
    const apiKey = await prompt("API Key (leave empty to create one later): ");

    mkdirSync(CONFIG_DIR, { recursive: true });

    const config = {
      serverUrl,
      apiKey: apiKey || undefined,
    };

    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`\nConfig saved to ${CONFIG_FILE}`);

    if (!apiKey) {
      console.log("\nNext steps:");
      console.log("  1. Start the server: pnpm dev");
      console.log("  2. Connect Gmail: agentcloak connect gmail");
      console.log("  3. Create an API key: agentcloak keys create <name>");
    }
  });
