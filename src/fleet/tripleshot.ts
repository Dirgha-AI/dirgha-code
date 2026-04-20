/**
 * fleet/tripleshot.ts — TripleShot + judge (claudio pattern).
 *
 * High-stakes tasks: spawn 3 agents with slight prompt variations in
 * parallel worktrees. A judge agent reviews their diffs and picks the
 * best one. Cheap with fast models; massive quality bump vs single-shot.
 *
 *   dirgha fleet triple "implement JWT refresh"
 *     → 3 agents (conservative / balanced / bold)
 *     → judge picks winner, applies back
 */
import chalk from 'chalk';
import { execFileSync } from 'node:child_process';
import { launchFleet } from './runtime.js';
import { applyBack } from './apply-back.js';
import { getRepoRoot, slug } from './worktree.js';
import { callModel } from '../providers/dispatch.js';
import type { FleetAgent, FleetLaunchOptions, FleetSubtask } from './types.js';

const VARIATIONS: Array<{ id: string; style: string }> = [
  { id: 'conservative', style: 'Prioritize minimal changes, safety, and backward compatibility. Prefer the smallest diff that satisfies the goal.' },
  { id: 'balanced',     style: 'Balance correctness with cleanliness. Refactor when it improves clarity but stay focused.' },
  { id: 'bold',         style: 'Optimize for long-term code quality. Aggressively refactor adjacent code that is clearly improved by the change.' },
];

const JUDGE_SYSTEM = `You are a code review judge. You will be shown a goal and 3 candidate diffs. Pick the BEST one based on:
  - Correctness (does it solve the goal?)
  - Simplicity (smallest diff that's right)
  - No regressions (tests still pass if visible)
  - Style fit (matches repo conventions)

Output STRICT JSON only:
{ "winner": "conservative|balanced|bold", "reason": "<1-2 sentences>", "runner_up": "<other id>" }`;

export async function tripleShot(
  goal: string,
  options: FleetLaunchOptions & { autoMerge?: boolean; model: string },
): Promise<{ winner: string; reason: string; agents: FleetAgent[] }> {
  const goalSlug = slug(goal) || 'triple';
  const subtasks: FleetSubtask[] = VARIATIONS.map(v => ({
    id: `${goalSlug}-${v.id}`,
    title: `[${v.id}] ${goal}`.slice(0, 80),
    task: `${goal}\n\nStylistic guidance: ${v.style}`,
    type: 'code',
  }));

  process.stderr.write(chalk.dim(`[triple] spawning 3 variants…\n`));
  const result = await launchFleet(goal, subtasks, { ...options, concurrency: 3 });

  const succeeded = result.agents.filter(a => a.status === 'completed');
  if (succeeded.length === 0) {
    return { winner: '', reason: 'No agent completed successfully', agents: result.agents };
  }
  if (succeeded.length === 1) {
    const a = succeeded[0]!;
    return { winner: a.id, reason: 'Only one variant completed', agents: result.agents };
  }

  // Collect diffs
  const repoRoot = getRepoRoot();
  const parentHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const candidates: Array<{ id: string; style: string; diff: string; agent: FleetAgent }> = [];
  for (const a of succeeded) {
    let diff = '';
    try {
      // Ensure diff is computed against the parent repo's HEAD
      execFileSync('git', ['add', '-A'], { cwd: a.worktreePath, stdio: 'ignore' });
      diff = execFileSync('git', ['diff', parentHead, '--'], {
        cwd: a.worktreePath, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
      });
    } catch { /* skip */ }
    const variation = VARIATIONS.find(v => a.id.endsWith(`-${v.id}`));
    if (variation && diff.trim()) {
      candidates.push({ id: variation.id, style: variation.style, diff: diff.slice(0, 8000), agent: a });
    }
  }

  if (candidates.length === 0) {
    return { winner: '', reason: 'No variant produced a diff', agents: result.agents };
  }

  // Ask judge
  const judgePrompt =
    `GOAL: ${goal}\n\n` +
    candidates.map(c => `=== ${c.id.toUpperCase()} (${c.style}) ===\n${c.diff}\n`).join('\n') +
    `\nPick the best and output JSON.`;

  let judgeRaw = '';
  try {
    const resp = await callModel(
      [{ role: 'user', content: judgePrompt }],
      JUDGE_SYSTEM,
      options.model,
    );
    judgeRaw = resp.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text ?? '')
      .join('');
  } catch (err) {
    return { winner: candidates[0]!.id, reason: `Judge failed: ${err}`, agents: result.agents };
  }

  const match = judgeRaw.match(/\{[\s\S]*?"winner"[\s\S]*?\}/);
  let winnerId = candidates[0]!.id;
  let reason = 'Judge output unparseable; defaulting to first completed';
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed.winner && VARIATIONS.some(v => v.id === parsed.winner)) {
        winnerId = parsed.winner;
        reason = parsed.reason ?? 'No reason given';
      }
    } catch { /* keep default */ }
  }

  // Auto-merge winner if requested
  if (options.autoMerge) {
    const winnerAgent = candidates.find(c => c.id === winnerId)?.agent;
    if (winnerAgent) {
      const ab = applyBack(winnerAgent.worktreePath, repoRoot, `triple: ${winnerId} (${goal.slice(0, 40)})`);
      if (ab.success) {
        process.stderr.write(chalk.green(`✓ Auto-merged ${winnerId} — ${ab.appliedFiles.length} file(s)\n`));
      } else {
        process.stderr.write(chalk.red(`✗ Auto-merge failed: ${ab.error}\n`));
      }
    }
  }

  return { winner: winnerId, reason, agents: result.agents };
}
