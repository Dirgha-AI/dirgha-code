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

import type { AgentHooks, UsageTotal } from "../kernel/types.js";
import {
  appendLedger,
  ledgerScope,
  type LedgerScope,
} from "../context/ledger.js";

const FINDING_PATTERNS = [
  /(?:found|located|discovered|note|key finding|important)[:\s]+(.{10,200})/i,
  /(?:file|path|module|function)[:\s]+(`[^`]+`|[\w/.-]+\.[a-z]{1,5})/i,
  /(?:error|bug|issue|problem)[:\s]+(.{10,200})/i,
];

/** Create a ledger scope for a fleet run. */
export function fleetLedgerScope(goalSlug: string): LedgerScope {
  return ledgerScope(`fleet-${goalSlug}`);
}

export function createLedgerHook(
  agentId: string,
  scope: LedgerScope,
): AgentHooks {
  let lastWriteAt = 0;
  // Capture the last assistant text — runner.ts sets this ref after each turn.
  const state = { lastText: "" };

  return {
    afterTurn: async (turnIndex: number, _usage: UsageTotal): Promise<void> => {
      const text = state.lastText;
      state.lastText = "";

      if (turnIndex < 2) return;
      if (text.length < 100) return;
      const now = Date.now();
      if (now - lastWriteAt < 60_000) return;

      const bullets = extractFacts(text);
      if (!bullets.length) return;

      lastWriteAt = now;
      const entry = `[agent:${agentId} turn:${turnIndex}]\n${bullets.map((b) => `- ${b}`).join("\n")}`;
      await appendLedger(scope, { kind: "observation", text: entry });
    },
    // Expose the state ref so runner.ts can set the last assistant text.
    _state: state,
  } as AgentHooks & { _state: { lastText: string } };
}

function extractFacts(text: string): string[] {
  const bullets: string[] = [];
  for (const pat of FINDING_PATTERNS) {
    const m = pat.exec(text);
    if (m?.[1]) bullets.push(m[1].trim().slice(0, 120));
    if (bullets.length >= 5) break;
  }
  // Also grab the last meaningful sentence as a fallback summary.
  if (!bullets.length) {
    const sentences = text
      .split(/[.!?]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40 && s.length < 200);
    if (sentences.length > 0)
      bullets.push(sentences[sentences.length - 1] as string);
  }
  return bullets;
}
