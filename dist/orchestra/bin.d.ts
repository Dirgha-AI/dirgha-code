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
export interface OrchestraOpts {
    json?: boolean;
    cwd?: string;
}
/**
 * Main dispatch: called from main.ts when user types `dirgha orchestra …`.
 * `argv` is everything after "orchestra". Returns exit code.
 */
export declare function orchestraCommand(argv: string[], opts?: OrchestraOpts): Promise<number>;
