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

import {
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import type { Tool, ToolContext } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import type { Message } from "../kernel/types.js";
import { SessionStore, type SessionEntry } from "../context/session.js";
import { registerCheckpoint } from "../state/index.js";

export interface CheckpointToolOptions {
  store?: SessionStore;
}

type Action = "save" | "restore" | "list" | "delete";

interface Input {
  action: Action;
  id?: string;
  label?: string;
  all?: boolean;
}

interface CheckpointFile {
  id: string;
  sessionId: string;
  createdAt: string;
  label?: string;
  cwd: string;
  messageCount: number;
  messages: Message[];
}

interface CheckpointSummary {
  id: string;
  sessionId: string;
  createdAt: string;
  label?: string;
  cwd: string;
  messageCount: number;
  path: string;
  bytes: number;
}

const CHECKPOINT_DIR = join(homedir(), ".dirgha", "checkpoints");

async function ensureDir(): Promise<void> {
  await mkdir(CHECKPOINT_DIR, { recursive: true }).catch(() => undefined);
}

function checkpointPath(id: string): string {
  return join(CHECKPOINT_DIR, `${id}.json`);
}

function newCheckpointId(sessionId: string): string {
  return `${sessionId}-${Date.now()}`;
}

function ok<T>(content: string, data: T): ToolResult<T> {
  return { content, data, isError: false };
}

function fail(content: string): ToolResult<never> {
  return { content, isError: true } as ToolResult<never>;
}

async function readCheckpoint(id: string): Promise<CheckpointFile | undefined> {
  const p = checkpointPath(id);
  const raw = await readFile(p, "utf8").catch(() => undefined);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as CheckpointFile;
  } catch {
    return undefined;
  }
}

async function listCheckpointFiles(): Promise<string[]> {
  await ensureDir();
  const names = await readdir(CHECKPOINT_DIR).catch(() => [] as string[]);
  return names.filter((n) => n.endsWith(".json"));
}

async function summarise(
  fileName: string,
): Promise<CheckpointSummary | undefined> {
  const id = fileName.replace(/\.json$/, "");
  const cp = await readCheckpoint(id);
  if (!cp) return undefined;
  const info = await stat(checkpointPath(id)).catch(() => undefined);
  return {
    id: cp.id,
    sessionId: cp.sessionId,
    createdAt: cp.createdAt,
    label: cp.label,
    cwd: cp.cwd,
    messageCount: cp.messageCount,
    path: checkpointPath(id),
    bytes: info?.size ?? 0,
  };
}

async function doSave(
  input: Input,
  ctx: ToolContext,
  store: SessionStore,
): Promise<ToolResult<CheckpointSummary>> {
  await ensureDir();
  const session = await store.open(ctx.sessionId);
  if (!session) return fail(`session not found: ${ctx.sessionId}`);

  const messages = await session.messages();
  const id = newCheckpointId(ctx.sessionId);
  const payload: CheckpointFile = {
    id,
    sessionId: ctx.sessionId,
    createdAt: new Date().toISOString(),
    label: input.label,
    cwd: ctx.cwd,
    messageCount: messages.length,
    messages,
  };
  const path = checkpointPath(id);
  await writeFile(path, JSON.stringify(payload, null, 2), "utf8");
  // Register in unified state index (fire-and-forget, never blocks).
  void registerCheckpoint(ctx.sessionId, id);
  const info = await stat(path).catch(() => undefined);

  const summary: CheckpointSummary = {
    id,
    sessionId: ctx.sessionId,
    createdAt: payload.createdAt,
    label: input.label,
    cwd: ctx.cwd,
    messageCount: messages.length,
    path,
    bytes: info?.size ?? 0,
  };
  return ok(
    `saved checkpoint ${id} (${messages.length} messages, ${summary.bytes} bytes)\npath: ${path}`,
    summary,
  );
}

async function doRestore(
  input: Input,
  ctx: ToolContext,
  store: SessionStore,
): Promise<ToolResult<CheckpointSummary>> {
  if (!input.id) return fail("id required for restore");
  const cp = await readCheckpoint(input.id);
  if (!cp) return fail(`checkpoint not found: ${input.id}`);

  const session = await store.open(ctx.sessionId);
  if (!session) return fail(`session not found: ${ctx.sessionId}`);

  // Record the restore in the append-only session log. We emit a system
  // marker first so replay can see when the splice happened, then one
  // message entry per snapshot message. The kernel treats these as
  // normal transcript entries on next replay.
  const markerTs = new Date().toISOString();
  const marker: SessionEntry = {
    type: "system",
    ts: markerTs,
    event: "checkpoint_restore",
    data: {
      checkpointId: cp.id,
      messageCount: cp.messageCount,
      originSessionId: cp.sessionId,
      originCwd: cp.cwd,
    },
  };
  await session.append(marker);

  for (const message of cp.messages) {
    const entry: SessionEntry = { type: "message", ts: cp.createdAt, message };
    await session.append(entry);
  }

  const info = await stat(checkpointPath(cp.id)).catch(() => undefined);
  const summary: CheckpointSummary = {
    id: cp.id,
    sessionId: cp.sessionId,
    createdAt: cp.createdAt,
    label: cp.label,
    cwd: cp.cwd,
    messageCount: cp.messageCount,
    path: checkpointPath(cp.id),
    bytes: info?.size ?? 0,
  };
  return ok(
    `restored checkpoint ${cp.id} into session ${ctx.sessionId} (+${cp.messageCount} messages)`,
    summary,
  );
}

async function doList(
  input: Input,
  ctx: ToolContext,
): Promise<ToolResult<{ count: number; items: CheckpointSummary[] }>> {
  const files = await listCheckpointFiles();
  const all = await Promise.all(files.map((f) => summarise(basename(f))));
  const items = all
    .filter((x): x is CheckpointSummary => x !== undefined)
    .filter((item) => (input.all ? true : item.sessionId === ctx.sessionId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  if (items.length === 0) {
    return ok(
      input.all
        ? "(no checkpoints on disk)"
        : `(no checkpoints for session ${ctx.sessionId})`,
      { count: 0, items },
    );
  }

  const lines = items.map((i) => {
    const label = i.label ? ` "${i.label}"` : "";
    return `${i.id}${label}\t${i.createdAt}\tsession=${i.sessionId}\tmsgs=${i.messageCount}\t${i.bytes}B`;
  });
  return ok(lines.join("\n"), { count: items.length, items });
}

async function doDelete(
  input: Input,
): Promise<ToolResult<{ deleted: string }>> {
  if (!input.id) return fail("id required for delete");
  const p = checkpointPath(input.id);
  const info = await stat(p).catch(() => undefined);
  if (!info) return fail(`checkpoint not found: ${input.id}`);
  await unlink(p);
  return ok(`deleted checkpoint ${input.id}`, { deleted: input.id });
}

export function createCheckpointTool(opts: CheckpointToolOptions = {}): Tool {
  const store = opts.store ?? new SessionStore();

  return {
    name: "checkpoint",
    description:
      "Save, list, restore, and delete session checkpoints. Snapshots the transcript (messages + cwd + timestamp) to ~/.dirgha/checkpoints so the user can rewind to a known-good agent state.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["save", "restore", "list", "delete"],
        },
        id: {
          type: "string",
          description: "Checkpoint id for restore/delete.",
        },
        label: {
          type: "string",
          description: "Optional human label attached to a save.",
        },
        all: {
          type: "boolean",
          description: "List checkpoints from every session, not just current.",
        },
      },
      required: ["action"],
    },
    requiresApproval: (raw: unknown): boolean => {
      if (!raw || typeof raw !== "object") return false;
      const input = raw as Input;
      return input.action !== "list";
    },
    async execute(rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
      const input = rawInput as Input;
      if (!input || typeof input.action !== "string") {
        return fail("action required");
      }
      try {
        switch (input.action) {
          case "save":
            return await doSave(input, ctx, store);
          case "restore":
            return await doRestore(input, ctx, store);
          case "list":
            return await doList(input, ctx);
          case "delete":
            return await doDelete(input);
          default:
            return fail(
              `unknown action: ${String((input as { action: unknown }).action)}`,
            );
        }
      } catch (err) {
        return fail(
          `checkpoint ${input.action} failed: ${(err as Error).message}`,
        );
      }
    },
  };
}

export const checkpointTool = createCheckpointTool();

export default checkpointTool;
