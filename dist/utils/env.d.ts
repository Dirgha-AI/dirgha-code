/**
 * Return a sanitised copy of `env` with all sensitive variables stripped.
 * Only known-benign variables (PATH, HOME, TERM, etc.) and variables
 * that do NOT match any sensitive pattern are passed through.
 *
 * Returns `Record<string, string>` (undefined values are dropped).
 */
export declare function safeEnvironment(env?: NodeJS.ProcessEnv): Record<string, string>;
