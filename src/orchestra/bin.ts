#!/usr/bin/env node
/**
 * orchestra/bin.ts — CLI entry point for `dirgha orchestra`.
 *
 * Parses the verb and dispatches to the appropriate handler.
 *
 * Verbs:
 *   up <task...>        Spawn N agents, start dashboard
 *   list [--json]       List active sessions
 *   attach <id>         Resume watching a session
 *   kill <agent-id>     Kill one agent by label/id
 *   down <session-id>   Kill all agents in a session
 *   log <session-id>    Tail orchestration log
 */

import { exit, stdout, stderr } from "node:process";
import { registry } from "./core/registry.js";
import type { OrchestraVerb, OrchestraSession } from "./core/types.js";
import { logPath, readLog } from "./orchestration/log.js";
import { loadSessions, saveSessions, removeStoredSession } from "./core/store.js";
import { spawnDirghaFleet } from "./agent/dirgha.js";
import { killAll, killAgent } from "./agent/manager.js";

const HELP = `dirgha orchestra — multi-agent task orchestration

USAGE:
  dirgha orchestra up <task...>        Spawn N agents, one per task
  dirgha orchestra list [--json]       List active sessions
  dirgha orchestra attach <id>         Attach to a running session
  dirgha orchestra kill <agent-id>     Kill a specific agent
  dirgha orchestra down <session-id>   Tear down a session
  dirgha orchestra log <session-id>    Show orchestration log

EXAMPLES:
  dirgha orchestra up "refactor auth" "add tests"
  dirgha orchestra list
  dirgha orchestra kill agent-1
  dirgha orchestra down orchestra-a1b2
`;

export interface OrchestraOpts {
  json?: boolean;
  cwd?: string;
}

/**
 * Find a session by id: check in-memory registry first, then persisted store.
 */
function findSession(id: string): OrchestraSession | undefined {
  return registry.get(id) ?? loadSessions().find((s) => s.id === id);
}

/**
 * Main dispatch: called from main.ts when user types `dirgha orchestra …`.
 * `argv` is everything after "orchestra". Returns exit code.
 */
export async function orchestraCommand(
  argv: string[],
  opts: OrchestraOpts = {},
): Promise<number> {
  // Parse --json (--flag as positional from the raw argv).
  const rest = argv.filter((a) => a !== "--json");
  const hasJson = argv.includes("--json") || opts.json === true;
  const mergedOpts: OrchestraOpts = { ...opts, json: hasJson };

  const [verb, ...verbArgs] = rest;

  // Handle help before the typed switch so "--help"/"-h"/"help" don't
  // need to be members of the OrchestraVerb union.
  if (verb === undefined || verb === "--help" || verb === "-h" || verb === "help") {
    stdout.write(HELP);
    return 0;
  }

  switch (verb as OrchestraVerb) {

    case "up":
      return cmdUp(verbArgs, mergedOpts);

    case "list":
      return cmdList(mergedOpts);

    case "attach":
      return cmdAttach(verbArgs, mergedOpts);

    case "kill":
      return cmdKill(verbArgs, mergedOpts);

    case "down":
      return cmdDown(verbArgs, mergedOpts);

    case "log":
      return cmdLog(verbArgs, mergedOpts);

    default:
      stderr.write(`orchestra: unknown verb "${verb}". See dirgha orchestra --help\n`);
      return 1;
  }
}

/** `orchestra up <task...>` — spawn N agents and persist the session. */
async function cmdUp(
  tasks: string[],
  _opts: OrchestraOpts,
): Promise<number> {
  if (tasks.length === 0) {
    stderr.write("orchestra up: at least one task required\n");
    stderr.write("  dirgha orchestra up \"refactor auth\" \"add tests\"\n");
    return 1;
  }

  const session = registry.create({ active: true });
  saveSessions([session]);

  stdout.write(`orchestra: starting session ${session.id} with ${tasks.length} agent(s)\n`);
  stdout.write(`orchestra: log → ${logPath(session.id)}\n`);

  const results = await spawnDirghaFleet(session.id, tasks);

  let spawned = 0;
  for (const r of results) {
    if (r) {
      stdout.write(`  ${r.agentId}: spawned as PID ${r.process.pid}\n`);
      spawned++;
      r.done.then((code) => {
        stdout.write(`  ${r.agentId}: exited with code ${code}\n`);
        const hasRunning = registry.get(session.id)?.agents.some(
          (a) => a.status === "running",
        ) ?? false;
        registry.update(session.id, { active: hasRunning });
        const s = registry.get(session.id);
        if (s) saveSessions([s]);
      });
    }
  }

  stdout.write(`orchestra: ${spawned}/${tasks.length} agents spawned\n`);

  const s = registry.get(session.id);
  if (s) saveSessions([s]);

  return 0;
}

/** `orchestra list [--json]` — list all sessions. */
async function cmdList(
  opts: OrchestraOpts,
): Promise<number> {
  const sessions = registry.list();
  const persisted = loadSessions();
  const allIds = new Set(sessions.map((s) => s.id));
  for (const s of persisted) {
    if (!allIds.has(s.id)) sessions.push(s);
  }

  if (opts.json) {
    stdout.write(JSON.stringify(sessions, null, 2) + "\n");
    return 0;
  }

  if (sessions.length === 0) {
    stdout.write("orchestra: no sessions\n");
    return 0;
  }

  for (const s of sessions) {
    const running = s.agents.filter((a) => a.status === "running").length;
    const done = s.agents.filter((a) => a.status === "done").length;
    const failed = s.agents.filter((a) => a.status === "failed").length;
    const status = s.active ? "ACTIVE" : "INACTIVE";
    stdout.write(
      `  ${s.id}  ${s.title.padEnd(20)} ${status}  ` +
      `${s.agents.length} agents (${running} running, ${done} done, ${failed} failed)\n`,
    );
  }
  return 0;
}

/** `orchestra attach <id>` — show session status + log path. */
async function cmdAttach(
  args: string[],
  _opts: OrchestraOpts,
): Promise<number> {
  const id = args[0];
  if (!id) {
    stderr.write("orchestra attach: session id required\n");
    return 1;
  }

  const session = findSession(id);
  if (!session) {
    stderr.write(`orchestra: session "${id}" not found\n`);
    return 1;
  }

  stdout.write(`Session: ${session.id} (${session.title})\n`);
  stdout.write(`Status: ${session.active ? "ACTIVE" : "INACTIVE"}\n`);
  stdout.write(`Log: ${logPath(session.id)}\n`);
  stdout.write(`Agents:\n`);
  for (const agent of session.agents) {
    stdout.write(
      `  ${agent.id.padEnd(16)} ${agent.status.padEnd(10)} ` +
      `PID ${String(agent.pid).padEnd(6)} ` +
      `${agent.outputBuffer.length} output lines\n`,
    );
  }
  return 0;
}

/** `orchestra kill <agent-id>` — kill a specific agent. */
async function cmdKill(
  args: string[],
  _opts: OrchestraOpts,
): Promise<number> {
  const target = args[0];
  if (!target) {
    stderr.write("orchestra kill: agent id required (e.g. agent-1)\n");
    return 1;
  }

  for (const session of registry.list()) {
    const agent = session.agents.find(
      (a) => a.id === target || a.label === target,
    );
    if (agent) {
      await killAgent(session.id, agent.id);
      stdout.write(`orchestra: killed ${agent.id} in session ${session.id}\n`);
      const s = registry.get(session.id);
      if (s) saveSessions([s]);
      return 0;
    }
  }

  stderr.write(`orchestra: agent "${target}" not found in any active session\n`);
  return 1;
}

/** `orchestra down <session-id>` — kill all agents in a session. */
async function cmdDown(
  args: string[],
  _opts: OrchestraOpts,
): Promise<number> {
  const id = args[0];
  if (!id) {
    stderr.write("orchestra down: session id required\n");
    return 1;
  }

  const session = findSession(id);
  if (!session) {
    stderr.write(`orchestra: session "${id}" not found\n`);
    return 1;
  }

  await killAll(session.id);
  removeStoredSession(session.id);
  stdout.write(`orchestra: session ${session.id} torn down\n`);
  return 0;
}

/** `orchestra log <session-id>` — show the orchestration log. */
async function cmdLog(
  args: string[],
  _opts: OrchestraOpts,
): Promise<number> {
  const id = args[0];
  if (!id) {
    stderr.write("orchestra log: session id required\n");
    return 1;
  }

  const session = findSession(id);
  if (!session) {
    stderr.write(`orchestra: session "${id}" not found\n`);
    return 1;
  }

  const entries = readLog(id);
  if (entries.length === 0) {
    stdout.write(`orchestra: no log entries for session ${id}\n`);
    return 0;
  }

  for (const entry of entries.slice(-100)) {
    stdout.write(
      `[${entry.timestamp}] ${entry.agentId} ${entry.event} ` +
      `${JSON.stringify(entry.payload)}\n`,
    );
  }
  return 0;
}

// Direct execution (for testing).
if (import.meta.url === `file://${process.argv[1]}`) {
  orchestraCommand(process.argv.slice(3)).then(exit);
}
