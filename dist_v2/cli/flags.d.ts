/**
 * Flag parser. Minimal but strict: supports --long, -s short flags,
 * --key=value and --key value. Unknown flags are returned as positionals
 * so callers can detect and reject them.
 *
 * Boolean flags (listed in BOOLEAN_FLAGS) never consume the next argv
 * token. This matters for `dirgha --json "prompt"` — without the
 * allowlist, "prompt" would be treated as the value of --json and
 * the actual prompt would be lost.
 */
export interface ParsedFlags {
    flags: Record<string, string | boolean>;
    positionals: string[];
}
export declare function parseFlags(argv: string[]): ParsedFlags;
