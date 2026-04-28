/**
 * Session checkpoint tool.
 *
 * Snapshots the current session (messages + cwd + timestamp) into
 * `~/.dirgha/checkpoints/<sessionId>-<timestamp>.json` so a user can
 * rewind to a known-good agent state. The v1 checkpoint tool used a
 * shadow-git bare repo to snapshot project files on disk; v2 inverts
 * that — the session log is the source of truth, so we snapshot the
 * *conversation* and leave filesystem state to the user's own VCS.
 *
 * Subcommands:
 *   save      — write a snapshot file, returns its id.
 *   restore   — load a snapshot and re-emit its messages into the
 *               active session log as system entries so later replay
 *               picks them up. Does NOT rewrite history in place.
 *   list      — enumerate snapshots for the active session, or all.
 *   delete    — remove a snapshot file by id.
 *
 * Note: restore is additive (appends the snapshot back onto the live
 * session log). The kernel decides whether to prune older turns on a
 * subsequent compaction — we don't truncate files here.
 */
import type { Tool } from './registry.js';
export declare const checkpointTool: Tool;
export default checkpointTool;
