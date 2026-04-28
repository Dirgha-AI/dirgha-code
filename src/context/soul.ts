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

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const SOUL_CAP_BYTES = 4_000;

export interface SoulResult {
  text: string;
  source: 'user' | 'default';
  path: string;
}

function userSoulPath(home: string = homedir()): string {
  return join(home, '.dirgha', 'soul.md');
}

function defaultSoulPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'default-soul.md');
}

function readCapped(path: string): string {
  const raw = readFileSync(path, 'utf8');
  if (raw.length <= SOUL_CAP_BYTES) return raw.trim();
  return `${raw.slice(0, SOUL_CAP_BYTES).trim()}\n\n[...soul truncated to 4 KB...]`;
}

/**
 * Load the soul. Tries the user override first, falls back to the
 * default that ships with the package. Returns the source so callers
 * can surface "[user-soul]" / "[default-soul]" in `dirgha status`.
 */
export function loadSoul(home: string = homedir()): SoulResult {
  const userPath = userSoulPath(home);
  try {
    if (statSync(userPath).isFile()) {
      return { text: readCapped(userPath), source: 'user', path: userPath };
    }
  } catch { /* not present */ }
  const path = defaultSoulPath();
  try {
    return { text: readCapped(path), source: 'default', path };
  } catch {
    // Last-ditch fallback if the package layout is broken (shouldn't
    // happen, but soul reads are non-blocking).
    return { text: 'You are dirgha, a terminal coding agent. Be terse, direct, and helpful.', source: 'default', path };
  }
}

/** Return the path the user should edit to override the soul. */
export function userSoulOverridePath(home: string = homedir()): string {
  return userSoulPath(home);
}
