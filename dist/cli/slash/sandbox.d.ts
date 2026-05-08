/**
 * /sandbox — explicit toggle for tool-execution containment.
 *
 * Modes:
 *   off    — current behaviour. Tools run with user privileges.
 *   auto   — shell/git/lsp confined to cwd via the platform sandbox
 *            adapter (bwrap on Linux, sandbox-exec on macOS, JobObject
 *            on Windows). Network allowed (npm, git pull, pip install
 *            still work).
 *   strict — same fs confinement plus network ban. Catches network
 *            exfiltration and `curl ... | sh` style attacks.
 *
 * fs-* tools and search-glob still run inline JS today and are not
 * affected by this setting (path-allowlist work is queued for a
 * follow-up release).
 *
 * Persists to `~/.dirgha/config.json`. Live toggle takes effect on
 * the next tool call without restarting dirgha.
 */
import type { SlashCommand } from "./types.js";
export declare const sandboxCommand: SlashCommand;
