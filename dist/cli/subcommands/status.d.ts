/**
 * `dirgha status` — snapshot of the CLI state.
 *
 * Reports:
 *   - whether the user is logged in (via device-auth credentials)
 *   - current default model + configured providers
 *   - session store location + count
 *   - quota summary when logged in (best-effort; silent on error)
 *
 * Mirrors the REPL `/status` slash but is scoped to globals rather
 * than a live session.
 */
import type { Subcommand } from './index.js';
export declare const statusSubcommand: Subcommand;
