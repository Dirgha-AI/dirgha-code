/**
 * dirgha's "soul" — the agent's persona, tone, and operating norms.
 * A plain Markdown file users can override at:
 *
 *   ~/.dirgha/soul.md
 *
 * No frontmatter, no schema — whatever you put there becomes the
 * agent's character. The default ships with the package; users edit
 * to taste. Mode preamble, project primer, git_state, and the user's
 * `--system` flag all stack on top of the soul in `composeSystemPrompt`.
 *
 * Design notes:
 *   - Default lives in `default-soul.md` next to this file so it's
 *     visible / forkable / diff-able. `import.meta.url` resolves it.
 *   - Cap 4 KB. A blown-up soul drowns the rest of the system prompt.
 *   - File-not-found / parse error → fall through to the default.
 *     Soul reads must never break the run.
 */
export interface SoulResult {
    text: string;
    source: 'user' | 'default';
    path: string;
}
/**
 * Load the soul. Tries the user override first, falls back to the
 * default that ships with the package. Returns the source so callers
 * can surface "[user-soul]" / "[default-soul]" in `dirgha status`.
 */
export declare function loadSoul(home?: string): SoulResult;
/** Return the path the user should edit to override the soul. */
export declare function userSoulOverridePath(home?: string): string;
