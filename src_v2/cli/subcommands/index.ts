/**
 * Subcommand barrel.
 *
 * Each subcommand is a `{ name, aliases?, run }` record. `run` receives
 * the remaining positional argv (everything after the verb) plus a
 * lightweight context bag with the shared CLI dependencies. It returns
 * a POSIX-style exit code (0 = success).
 *
 * `main.ts` may dispatch directly to the `run*` helpers or iterate this
 * list for generic dispatch — both patterns coexist so we can keep
 * adding new verbs without stomping on the existing wiring.
 */
export interface SubcommandCtx {
  cwd: string;
}

export interface Subcommand {
  name: string;
  aliases?: string[];
  description: string;
  run(argv: string[], ctx: SubcommandCtx): Promise<number>;
}

import { doctorSubcommand } from './doctor.js';
import { loginSubcommand, runLogin } from './login.js';
import { logoutSubcommand, runLogout } from './logout.js';
import { setupSubcommand, runSetup } from './setup.js';
import { auditSubcommand } from './audit.js';
import { statsSubcommand } from './stats.js';
import { statusSubcommand } from './status.js';
import { initSubcommand } from './init.js';
import { keysSubcommand } from './keys.js';
import { modelsSubcommand } from './models.js';
import { chatSubcommand } from './chat.js';
import { askSubcommand } from './ask.js';
import { compactSubcommand } from './compact.js';
import { exportSessionSubcommand } from './export-session.js';
import { importSessionSubcommand } from './import-session.js';

export const subcommands: Subcommand[] = [
  doctorSubcommand,
  loginSubcommand,
  logoutSubcommand,
  setupSubcommand,
  auditSubcommand,
  statsSubcommand,
  statusSubcommand,
  initSubcommand,
  keysSubcommand,
  modelsSubcommand,
  chatSubcommand,
  askSubcommand,
  compactSubcommand,
  exportSessionSubcommand,
  importSessionSubcommand,
];

export function findSubcommand(verb: string): Subcommand | undefined {
  return subcommands.find(cmd => cmd.name === verb || (cmd.aliases ?? []).includes(verb));
}

export { runLogin, runLogout, runSetup };
export {
  loginSubcommand,
  logoutSubcommand,
  setupSubcommand,
  doctorSubcommand,
  auditSubcommand,
  statsSubcommand,
  statusSubcommand,
  initSubcommand,
  keysSubcommand,
  modelsSubcommand,
  chatSubcommand,
  askSubcommand,
  compactSubcommand,
  exportSessionSubcommand,
  importSessionSubcommand,
};
