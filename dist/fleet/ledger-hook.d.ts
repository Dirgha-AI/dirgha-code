/**
 * fleet/ledger-hook.ts — Auto-write fleet agent findings to the ledger.
 *
 * Returns an AgentHooks object whose afterTurn callback distills the last
 * assistant turn and appends it to the scoped ledger. Gates keep it cheap:
 * - Skip turns < 2 (orientation noise)
 * - Skip if text < 100 chars
 * - Rate-limit to one write per 60s per agent
 * - Extract facts via regex (no extra LLM call)
 */
import type { AgentHooks } from "../kernel/types.js";
import { type LedgerScope } from "../context/ledger.js";
/** Create a ledger scope for a fleet run. */
export declare function fleetLedgerScope(goalSlug: string): LedgerScope;
export declare function createLedgerHook(agentId: string, scope: LedgerScope): AgentHooks;
