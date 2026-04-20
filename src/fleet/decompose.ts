/**
 * fleet/decompose.ts — Goal decomposition: "one task" → "N parallel subtasks".
 *
 * Uses the current model to plan how a goal can be split into independent
 * streams that can run concurrently without conflicts. Returns a JSON array
 * of FleetSubtask.
 */
import { callModel } from '../providers/dispatch.js';
import { slug } from './worktree.js';
import type { FleetSubtask, AgentType } from './types.js';

const DECOMPOSE_SYSTEM = `You are a task decomposer. Given a user goal, split it into 2-5 INDEPENDENT subtasks that can run in PARALLEL without conflicting with each other (no shared-file edits).

For each subtask, pick ONE agent type:
  - explore:  read-only codebase investigation
  - plan:     produces a step-by-step plan (no code changes)
  - verify:   reads code + runs tests/checks
  - code:     makes code changes
  - research: web search + browse

Output STRICT JSON only — no prose, no markdown fences:
{
  "subtasks": [
    { "id": "short-kebab-id", "title": "human title", "task": "precise agent prompt with file paths", "type": "code" }
  ]
}

Rules:
- Max 5 subtasks
- IDs are kebab-case, unique, <30 chars
- Each task prompt is self-contained (no "see above")
- Prefer explore+plan before code agents when goal is vague
- If the goal is ALREADY a single atomic task, return 1 subtask`;

export interface DecomposeResult {
  subtasks: FleetSubtask[];
  raw: string;
}

/** Ask the model to decompose the goal. Falls back to single subtask on failure. */
export async function decomposeGoal(
  goal: string,
  model: string,
): Promise<DecomposeResult> {
  const prompt = `Goal: ${goal}\n\nDecompose into parallel subtasks as JSON.`;
  let raw = '';
  try {
    const response = await callModel(
      [{ role: 'user', content: prompt }],
      DECOMPOSE_SYSTEM,
      model,
    );
    raw = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text ?? '')
      .join('');
  } catch (err) {
    return fallback(goal, `decompose LLM call failed: ${err}`);
  }

  // Extract JSON block (may be wrapped in ```json ... ``` despite the prompt)
  const match = raw.match(/\{[\s\S]*"subtasks"[\s\S]*\}/);
  if (!match) return fallback(goal, 'no JSON in response', raw);

  try {
    const parsed = JSON.parse(match[0]);
    const subtasks = (parsed.subtasks ?? []) as any[];
    if (subtasks.length === 0) return fallback(goal, 'empty subtasks', raw);
    const normalized: FleetSubtask[] = subtasks.slice(0, 5).map((s, i) => ({
      id: s.id ? slug(String(s.id)) : `task-${i + 1}`,
      title: String(s.title ?? s.task ?? `Subtask ${i + 1}`).slice(0, 80),
      task: String(s.task ?? s.title ?? goal),
      type: (['explore', 'plan', 'verify', 'code', 'research', 'custom'].includes(s.type)
        ? s.type
        : 'code') as AgentType,
    }));
    return { subtasks: normalized, raw };
  } catch {
    return fallback(goal, 'invalid JSON', raw);
  }
}

function fallback(goal: string, _reason: string, raw = ''): DecomposeResult {
  return {
    subtasks: [{
      id: slug(goal) || 'main',
      title: goal.slice(0, 80),
      task: goal,
      type: 'code',
    }],
    raw,
  };
}
