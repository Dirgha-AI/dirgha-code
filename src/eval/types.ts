/**
 * Eval harness shared types.
 */

export interface EvalTask {
  id: string;
  prompt: string;
  system?: string;
  expectedArtifact?: { path: string; containsAnyOf?: string[]; excludes?: string[] };
  maxTurns?: number;
  timeoutMs?: number;
}

export interface EvalResult {
  taskId: string;
  ok: boolean;
  reason: string;
  durationMs: number;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
}

export interface EvalReport {
  suite: string;
  model: string;
  runAt: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: EvalResult[];
}
