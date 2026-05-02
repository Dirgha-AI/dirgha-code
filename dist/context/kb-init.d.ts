/**
 * Knowledge base bootstrap.
 *
 * Seeds the local qmd collection from docs/ on first use.
 * Runs fire-and-forget from the primer loader — never blocks startup.
 */
export declare function maybeInitKb(cwd: string): Promise<void>;
