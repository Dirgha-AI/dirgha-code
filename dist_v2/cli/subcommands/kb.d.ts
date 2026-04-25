/**
 * `dirgha kb` — knowledge base wrapper.
 *
 * Thin Node shim over the `openkb` Python CLI (OpenKB + PageIndex).
 * The wrapper:
 *   - Resolves a stable KB root at `~/.dirgha/kb/` so every project
 *     answers from the same wiki by default.
 *   - Auto-runs `openkb init` on first use.
 *   - Forwards subcommands verbatim, but adds two convenience
 *     defaults: `dirgha kb ingest` (alias for `openkb add` against
 *     a known set of project sources) and `dirgha kb query "<q>"`.
 *   - Audit-logs every kb mutation so the agent has a trail of when
 *     the wiki changed.
 *
 * If `openkb` isn't installed, prints the install command and exits 1
 * — never silently degrades.
 */
import type { Subcommand } from './index.js';
export declare const kbSubcommand: Subcommand;
