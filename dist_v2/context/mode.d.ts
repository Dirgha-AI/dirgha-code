/**
 * Execution mode for the agent loop. Each mode is a short preamble
 * prepended to the system prompt; it doesn't change the tool set or
 * the loop structure. Used by /mode slash and CLI flags.
 */
export declare const MODES: readonly ["plan", "act", "verify"];
export type Mode = (typeof MODES)[number];
export declare const DEFAULT_MODE: Mode;
export declare function modePreamble(mode: Mode): string;
/**
 * Prepend the mode preamble to an existing system prompt. If the
 * caller already supplied one, the mode preamble is inserted first,
 * separated by a blank line. If no prompt is supplied, the preamble
 * stands on its own.
 */
export declare function applyMode(systemPrompt: string | undefined, mode: Mode): string;
/**
 * Resolve the active mode. Precedence:
 *   1. process.env.DIRGHA_MODE (for one-off override)
 *   2. ~/.dirgha/config.json's `mode` field
 *   3. DEFAULT_MODE ('act')
 */
export declare function resolveMode(): Promise<Mode>;
/** Persist the user's preferred mode. */
export declare function saveMode(mode: Mode): Promise<void>;
