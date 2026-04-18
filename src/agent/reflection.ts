/**
 * agent/reflection.ts — Self-improvement reflection log (Week 1 of self-evolve sprint)
 *
 * Appends structured ReflectionEntry records to ~/.dirgha/reflections.jsonl after
 * each agent loop turn. This is the data pipeline for skill extraction and prompt evolution.
 *
 * Inspired by: Agent0 (trajectory buffer), AgentEvolver (credit assignment),
 * LangGraph Reflection (critique loop), Letta Code (hierarchical memory).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepRecord {
  tool: string;
  input: Record<string, unknown>;
  output: string;    // stdout / result text (truncated to 500 chars)
  success: boolean;  // exit 0 or non-error response
  credit: number;    // -1 to +1 (negative = caused error, positive = led to success)
  durationMs: number;
}

export interface CritiqueReport {
  qualityScore: number;  // 0.0–1.0
  issues: string[];
  promotedToSkill: boolean;
}

export interface ReflectionEntry {
  id: string;
  sessionId: string;
  timestamp: number;
  model: string;
  userInput: string;          // first 200 chars
  taskType: string;           // 'feature' | 'bugfix' | 'refactor' | 'explain' | 'other'
  steps: StepRecord[];
  totalTokens: number;
  finalOutcome: 'success' | 'failure' | 'aborted';
  errorSignature?: string;    // normalized hash of last error seen
  critique?: CritiqueReport;
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const REFLECTIONS_PATH = path.join(os.homedir(), '.dirgha', 'reflections.jsonl');
const MAX_FILE_BYTES = 5 * 1024 * 1024; // rotate at 5MB

function ensureDir() {
  fs.mkdirSync(path.dirname(REFLECTIONS_PATH), { recursive: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function classifyTask(input: string): string {
  const l = input.toLowerCase();
  if (/\b(fix|bug|error|broken|fail|crash|exception)\b/.test(l)) return 'bugfix';
  if (/\b(refactor|rename|move|restructure|clean)\b/.test(l)) return 'refactor';
  if (/\b(add|implement|create|build|write|feature)\b/.test(l)) return 'feature';
  if (/\b(explain|what|how|why|describe|tell me)\b/.test(l)) return 'explain';
  return 'other';
}

export function normalizeErrorSignature(text: string): string | undefined {
  // Extract first error-looking line and normalize dynamic parts
  const match = text.match(/(?:error|Error|ERROR|failed|FAILED)[^\n]{0,120}/i);
  if (!match) return undefined;
  return match[0]
    .replace(/['"][^'"]{0,60}['"]/g, 'STR')   // string literals
    .replace(/\b\d+\b/g, 'N')                  // numbers
    .replace(/\/[^\s]+/g, 'PATH')              // file paths
    .slice(0, 100);
}

// ─── Main API ─────────────────────────────────────────────────────────────────

export function appendReflection(entry: Omit<ReflectionEntry, 'id'>): void {
  try {
    ensureDir();

    // Rotate if too large
    try {
      const stat = fs.statSync(REFLECTIONS_PATH);
      if (stat.size > MAX_FILE_BYTES) {
        fs.renameSync(REFLECTIONS_PATH, REFLECTIONS_PATH + '.1');
      }
    } catch { /* file doesn't exist yet */ }

    const full: ReflectionEntry = { id: crypto.randomUUID().slice(0, 8), ...entry };
    fs.appendFileSync(REFLECTIONS_PATH, JSON.stringify(full) + '\n', 'utf8');
  } catch (err) {
    // Never crash the agent over telemetry
    if (process.env['DIRGHA_DEBUG']) {
      process.stderr.write(`[reflection] append failed: ${err}\n`);
    }
  }
}

export function readRecentReflections(limit = 50): ReflectionEntry[] {
  try {
    if (!fs.existsSync(REFLECTIONS_PATH)) return [];
    const lines = fs.readFileSync(REFLECTIONS_PATH, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map(l => JSON.parse(l)).reverse();
  } catch { return []; }
}

/** Return tool accuracy stats from recent N reflections */
export function getToolAccuracy(limit = 100): { tool: string; successRate: number; uses: number }[] {
  const entries = readRecentReflections(limit);
  const stats: Record<string, { success: number; total: number }> = {};
  for (const e of entries) {
    for (const s of e.steps) {
      if (!stats[s.tool]) stats[s.tool] = { success: 0, total: 0 };
      stats[s.tool]!.total++;
      if (s.success) stats[s.tool]!.success++;
    }
  }
  return Object.entries(stats)
    .map(([tool, { success, total }]) => ({ tool, successRate: success / total, uses: total }))
    .sort((a, b) => b.uses - a.uses);
}
