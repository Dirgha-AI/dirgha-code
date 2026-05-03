/**
 * Barrel for the built-in slash command set. The consuming integration
 * (typically in `../slash.ts` or `../interactive.ts`) should call
 * `registerHelpSource(builtinSlashCommands)` once, then bulk-register
 * each command against a `SlashRegistry` via its `execute` handler.
 */

import type { SlashCommand } from "./types.js";

import { accountCommand } from "./account.js";
import { clearCommand } from "./clear.js";
import { compactCommand } from "./compact.js";
import { configCommand } from "./config.js";
import { costCommand } from "./cost.js";
import { exitCommand } from "./exit.js";
import { exportCommand } from "./export.js";
import { fleetCommand } from "./fleet.js";
import { spawnCommand } from "./spawn.js";
import { fsCommand } from "./fs.js";
import { helpCommand, registerHelpSource } from "./help.js";
import { historyCommand } from "./history.js";
import { initCommand } from "./init.js";
import { keysCommand } from "./keys.js";
import { loginCommand } from "./login.js";
import { mcpCommand } from "./mcp.js";
import { memoryCommand } from "./memory.js";
import { modeCommand } from "./mode.js";
import { modelsCommand } from "./models.js";
import { pasteCommand } from "./paste.js";
import { providerCommand } from "./provider.js";
import { resumeCommand } from "./resume.js";
import { sessionCommand } from "./session.js";
import { setupCommand } from "./setup.js";
import { statusCommand } from "./status.js";
import { themeCommand } from "./theme.js";
import { updateCommand } from "./update.js";
import { upgradeCommand } from "./upgrade.js";

export const builtinSlashCommands: SlashCommand[] = [
  initCommand,
  keysCommand,
  modelsCommand,
  helpCommand,
  clearCommand,
  loginCommand,
  setupCommand,
  statusCommand,
  memoryCommand,
  compactCommand,
  costCommand,
  modeCommand,
  exitCommand,
  historyCommand,
  resumeCommand,
  sessionCommand,
  themeCommand,
  fleetCommand,
  spawnCommand,
  accountCommand,
  pasteCommand,
  providerCommand,
  updateCommand,
  upgradeCommand,
  configCommand,
  exportCommand,
  fsCommand,
  mcpCommand,
];

// Wire /help so it can introspect the full list without a circular import.
registerHelpSource(builtinSlashCommands);

export type { SlashCommand } from "./types.js";
export {
  accountCommand,
  clearCommand,
  compactCommand,
  configCommand,
  costCommand,
  exitCommand,
  exportCommand,
  fleetCommand,
  fsCommand,
  helpCommand,
  historyCommand,
  initCommand,
  keysCommand,
  loginCommand,
  mcpCommand,
  memoryCommand,
  modeCommand,
  modelsCommand,
  providerCommand,
  resumeCommand,
  sessionCommand,
  setupCommand,
  spawnCommand,
  statusCommand,
  themeCommand,
  updateCommand,
  upgradeCommand,
};
