/**
 * Flag parser. Minimal but strict: supports --long, -s short flags,
 * --key=value and --key value. Unknown flags are returned as positionals
 * so callers can detect and reject them.
 */
export interface ParsedFlags {
    flags: Record<string, string | boolean>;
    positionals: string[];
}
export declare function parseFlags(argv: string[]): ParsedFlags;
