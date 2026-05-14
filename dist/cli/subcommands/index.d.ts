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
import { pingSubcommand } from './ping.js';
export declare const subcommands: Subcommand[];
export declare function findSubcommand(verb: string): Subcommand | undefined;
/**
 * Returns the closest known command name if the given verb is an unrecognised
 * typo with edit distance ≤ 2 to any known subcommand name, alias, or top-level
 * verb. Returns undefined if the verb is an exact match (caller handles it) or
 * if no close-enough candidate exists.
 */
export declare function suggestCommand(verb: string): string | undefined;
export { runLogin, runLogout, runSetup };
export { loginSubcommand, logoutSubcommand, setupSubcommand, doctorSubcommand, auditSubcommand, statsSubcommand, statusSubcommand, pingSubcommand, initSubcommand, keysSubcommand, modelsSubcommand, chatSubcommand, askSubcommand, compactSubcommand, exportSessionSubcommand, importSessionSubcommand, };
