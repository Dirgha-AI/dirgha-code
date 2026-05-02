/**
 * `dirgha setup` — three-step provider/auth/model wizard.
 *
 * Designed as the first thing a new user sees. Replaces the older
 * one-step "pick provider, paste key" form with a clear:
 *   1. Pick a provider (Dirgha hosted is option 1; BYOK options follow)
 *   2. Authenticate (device-code for Dirgha, hidden-input for BYOK)
 *   3. Pick a default model from that provider's catalogue
 *
 * Auto-launched by `bin/dirgha` on first run when neither
 * `~/.dirgha/keys.json` nor `~/.dirgha/credentials.json` exists.
 *
 * Non-TTY: prints a static how-to instead of prompting (CI-safe).
 */
import type { Subcommand } from "../subcommands/index.js";
export declare function runWizard(argv: string[]): Promise<number>;
export declare const wizardSubcommand: Subcommand;
