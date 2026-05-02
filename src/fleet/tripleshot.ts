/**
 * fleet/tripleshot.ts — Spawn 3 stylistic variants, ask a judge, pick
 * the winner.
 *
 * For high-stakes tasks: the same goal is sent to three agents with
 * different stylistic framings (conservative / balanced / bold), each
 * in its own worktree. A judge agent is then asked to read the diffs
 * and pick the best one. Optionally auto-applies the winner back.
 *
 * The judge prompt is intentionally small and produces strict JSON so
 * parsing is deterministic; we fall back to the first completed variant
 * when the judge misbehaves.
 */

import { runFleet } from "./runner.js";
import { applyBack } from "./apply-back.js";
import { getHeadSha } from "./worktree.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ProviderRegistry } from "../providers/index.js";
import { createEventStream, type EventStream } from "../kernel/event-stream.js";
import type { AgentEvent, UsageTotal } from "../kernel/types.js";
import { repairJSON } from "../utils/json-repair.js";
import type {
  FleetConfig,
  FleetSubtask,
  TripleVariant,
  TripleshotResult,
  TripleshotShot,
} from "./types.js";

const pexec = promisify(execFile);

const VARIATIONS: Array<{ id: TripleVariant; style: string }> = [
  {
    id: "conservative",
    style:
      "Prioritize minimal changes, safety, and backward compatibility. Prefer the smallest diff that satisfies the goal.",
  },
  {
    id: "balanced",
    style:
      "Balance correctness with cleanliness. Refactor only when it clearly improves readability and stay focused on the stated goal.",
  },
  {
    id: "bold",
    style:
      "Optimize for long-term code quality. Aggressively refactor adjacent code that is clearly improved by the change, without breaking public APIs.",
  },
];

const JUDGE_SYSTEM = `You are a strict code-review judge. You will be shown a goal and up to 3 candidate diffs from variants named "conservative", "balanced", and "bold".

Pick the BEST one by:
  - Correctness — does it actually solve the goal?
  - Simplicity — smallest diff that is still correct.
  - Style fit — consistent with the apparent repo conventions.
  - No regressions — don't break adjacent code.

Output STRICT JSON only, no prose, no markdown:
{ "winner": "conservative|balanced|bold", "runner_up": "conservative|balanced|bold", "reason": "<1-2 sentences>" }`;

export interface TripleshotConfig extends Omit<
  FleetConfig,
  "subtasks" | "concurrency"
> {
  /** Auto-apply the winner's diff to the parent tree via applyBack. */
  autoMerge?: boolean;
  /** Override the judge model; defaults to `plannerModel` or `model`. */
  judgeModel?: string;
}

export async function runTripleshot(
  goal: string,
  config: TripleshotConfig,
): Promise<TripleshotResult> {
  const started = Date.now();
  const subtasks: FleetSubtask[] = VARIATIONS.map((v) => ({
    id: `${v.id}`,
    title: `[${v.id}] ${goal}`.slice(0, 80),
    task: `${goal}\n\nStylistic guidance: ${v.style}`,
    type: "code",
  }));

  const fleetResult = await runFleet({
    ...config,
    goal,
    subtasks,
    concurrency: 3,
  });

  const providers = new ProviderRegistry();
  const judgeModel =
    config.judgeModel ?? config.plannerModel ?? config.model ?? defaultModel();
  const events = config.events ?? createEventStream();

  const shots: TripleshotShot[] = [];
  const repoRoot = fleetResult.worktrees[0]?.repoRoot;
  const parentHead = repoRoot ? await getHeadSha(repoRoot) : "";

  for (const a of fleetResult.agents) {
    if (a.status !== "completed") continue;
    const variant = VARIATIONS.find((v) => a.id === v.id)?.id;
    if (!variant) continue;
    let diff = "";
    try {
      await pexec("git", ["add", "-A"], { cwd: a.worktreePath });
      const { stdout } = await pexec("git", ["diff", parentHead, "--"], {
        cwd: a.worktreePath,
        maxBuffer: 20 * 1024 * 1024,
      });
      diff = stdout;
    } catch {
      /* skip empty */
    }
    if (diff.trim()) {
      shots.push({ variant, agent: a, diff: diff.slice(0, 8000) });
    }
  }

  const tokens: UsageTotal = { ...fleetResult.totalTokens };

  if (shots.length === 0) {
    return {
      goal,
      winner: null,
      runnerUp: null,
      reason: "No variant produced a diff",
      shots: [],
      agents: fleetResult.agents,
      worktrees: fleetResult.worktrees,
      totalTokens: tokens,
      durationMs: Date.now() - started,
    };
  }

  if (shots.length === 1) {
    const only = shots[0]!;
    const handle = handleFor(fleetResult.worktrees, only.agent.worktreePath);
    const ab =
      config.autoMerge && handle
        ? await applyBack(handle, {
            message: `triple: ${only.variant} (${goal.slice(0, 40)})`,
          })
        : undefined;
    return {
      goal,
      winner: only.variant,
      runnerUp: null,
      reason: "Only one variant completed",
      shots,
      agents: fleetResult.agents,
      worktrees: fleetResult.worktrees,
      apply: ab,
      totalTokens: tokens,
      durationMs: Date.now() - started,
    };
  }

  const {
    winner,
    runnerUp,
    reason,
    usage: judgeUsage,
  } = await askJudge(goal, shots, judgeModel, providers, events);
  accumulate(tokens, judgeUsage);

  let apply: TripleshotResult["apply"];
  if (config.autoMerge && winner) {
    const winShot = shots.find((s) => s.variant === winner);
    if (winShot) {
      const handle = handleFor(
        fleetResult.worktrees,
        winShot.agent.worktreePath,
      );
      if (handle) {
        apply = await applyBack(handle, {
          message: `triple: ${winner} (${goal.slice(0, 40)})`,
        });
      }
    }
  }

  return {
    goal,
    winner,
    runnerUp,
    reason,
    shots,
    agents: fleetResult.agents,
    worktrees: fleetResult.worktrees,
    apply,
    totalTokens: tokens,
    durationMs: Date.now() - started,
  };
}

/* --------------------------- internals ---------------------------- */

interface JudgeVerdict {
  winner: TripleVariant | null;
  runnerUp: TripleVariant | null;
  reason: string;
  usage: UsageTotal;
}

async function askJudge(
  goal: string,
  shots: TripleshotShot[],
  judgeModel: string,
  providers: ProviderRegistry,
  events: EventStream,
): Promise<JudgeVerdict> {
  const prompt =
    `GOAL: ${goal}\n\n` +
    shots
      .map((s) => `=== ${s.variant.toUpperCase()} ===\n${s.diff}\n`)
      .join("\n") +
    `\nPick the best variant. Output JSON only.`;

  const provider = providers.forModel(judgeModel);
  const streamEvents: AgentEvent[] = [];
  try {
    for await (const ev of provider.stream({
      model: judgeModel,
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: prompt },
      ],
    })) {
      streamEvents.push(ev);
      events.emit(ev);
    }
  } catch (err) {
    return {
      winner: shots[0]?.variant ?? null,
      runnerUp: shots[1]?.variant ?? null,
      reason: `Judge error: ${err instanceof Error ? err.message : String(err)}`,
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 },
    };
  }

  const text = streamEvents
    .filter(
      (e): e is Extract<AgentEvent, { type: "text_delta" }> =>
        e.type === "text_delta",
    )
    .map((e) => e.delta)
    .join("");

  const usage = streamEvents
    .filter(
      (e): e is Extract<AgentEvent, { type: "usage" }> => e.type === "usage",
    )
    .reduce<UsageTotal>(
      (acc, e) => ({
        inputTokens: acc.inputTokens + e.inputTokens,
        outputTokens: acc.outputTokens + e.outputTokens,
        cachedTokens: acc.cachedTokens + (e.cachedTokens ?? 0),
        costUsd: acc.costUsd,
      }),
      { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 },
    );

  return parseVerdict(text, shots, usage);
}

function parseVerdict(
  text: string,
  shots: TripleshotShot[],
  usage: UsageTotal,
): JudgeVerdict {
  const defaultVerdict: JudgeVerdict = {
    winner: shots[0]?.variant ?? null,
    runnerUp: shots[1]?.variant ?? null,
    reason: "Judge output unparseable; defaulted to first completed variant.",
    usage,
  };

  const match = /\{[\s\S]*?\}/.exec(text);
  if (!match) return defaultVerdict;

  const parsed = repairJSON(match[0]);
  if (!parsed || typeof parsed !== "object") return defaultVerdict;

  const rec = parsed as Record<string, unknown>;
  const winner = isVariant(rec.winner) ? rec.winner : defaultVerdict.winner;
  const runnerUp = isVariant(rec.runner_up)
    ? rec.runner_up
    : defaultVerdict.runnerUp;
  const reason =
    typeof rec.reason === "string" ? rec.reason : "No reason given.";
  return {
    winner,
    runnerUp: winner === runnerUp ? null : runnerUp,
    reason,
    usage,
  };
}

function isVariant(v: unknown): v is TripleVariant {
  return v === "conservative" || v === "balanced" || v === "bold";
}

function accumulate(total: UsageTotal, add: UsageTotal): void {
  total.inputTokens += add.inputTokens;
  total.outputTokens += add.outputTokens;
  total.cachedTokens += add.cachedTokens;
  total.costUsd += add.costUsd;
}

function handleFor(
  worktrees: TripleshotResult["worktrees"],
  path: string,
): TripleshotResult["worktrees"][0] | undefined {
  const wt = worktrees.find((w) => w.path === path);
  return wt;
}

function defaultModel(): string {
  return process.env["DIRGHA_MODEL"] ?? "nvidia/minimaxai/minimax-m2.7";
}
