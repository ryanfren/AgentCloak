#!/usr/bin/env node

import { Command } from "commander";
import { setupCommand } from "./commands/setup.js";
import { connectCommand } from "./commands/connect.js";
import { keysCommand } from "./commands/keys.js";
import { filtersCommand } from "./commands/filters.js";
import { statusCommand } from "./commands/status.js";
import { resetPasswordCommand } from "./commands/reset-password.js";
import { accountsCommand } from "./commands/accounts.js";

const program = new Command();

program
  .name("agentcloak")
  .description("AgentCloak - Secure email proxy for AI agents")
  .version("0.1.0");

program.addCommand(setupCommand);
program.addCommand(connectCommand);
program.addCommand(keysCommand);
program.addCommand(filtersCommand);
program.addCommand(statusCommand);
program.addCommand(resetPasswordCommand);
program.addCommand(accountsCommand);

program.parse();
