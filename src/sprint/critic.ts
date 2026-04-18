// src/sprint/critic.ts — Critic model for ranking parallel sprint trajectories
import { callGateway } from '../agent/gateway.js';
import type { Message } from '../types.js';

export interface TrajectoryResult {
  messages: Message[];
  tokensUsed: number;
  outcome?: string;
  error?: string;
}

/**
 * Given 2+ agent trajectory results for the same task, use a critic LLM
 * to pick the best one. Falls back to first viable result if LLM fails.
 */
export async function rankTrajectories(
  task: string,
  results: TrajectoryResult[],
  model: string,
): Promise<TrajectoryResult> {
  if (results.length === 1) return results[0]!;

  const viable = results.filter(r => !r.error);
  if (viable.length === 0) return results[0]!;
  if (viable.length === 1) return viable[0]!;

  const summaries = viable.map((r, i) => {
    const lastMsg = [...r.messages].reverse().find(m => m.role === 'assistant');
    const content = typeof lastMsg?.content === 'string'
      ? lastMsg.content
      : Array.isArray(lastMsg?.content)
        ? lastMsg.content.map((b: any) => b.text ?? '').join(' ')
        : '';
    return `Trajectory ${i + 1} (${r.tokensUsed} tokens, outcome: ${r.outcome ?? 'unknown'}):\n${content.slice(0, 1200)}`;
  }).join('\n\n---\n\n');

  const prompt = `You are evaluating two agent solutions to the same coding task. Pick the better one.

Task: ${task}

${summaries}

Which trajectory produced a more correct, complete, and safe solution?
Respond with JSON only (no markdown): {"winner": 1, "reason": "brief explanation"}`;

  try {
    const resp = await callGateway(
      [{ role: 'user', content: prompt }],
      '',
      model,
    );
    const text = (resp.content ?? []).map((b: any) => b.text ?? '').join('');
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? '{"winner":1}');
    const idx = Math.max(0, Number(parsed.winner ?? 1) - 1);
    return viable[idx] ?? viable[0]!;
  } catch {
    return viable[0]!;
  }
}
