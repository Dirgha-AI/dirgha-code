/**
 * routing.ts — Smart model tier routing.
 * Routes simple queries to the fast model, complex ones to the full model.
 *
 * Short, simple messages go to the fast model; complex ones to the full model.
 */
import type { Message, ModelTier } from '../types.js';
import { getActiveProvider } from '../providers/detection.js';

const COMPLEXITY_KEYWORDS = [
  'refactor', 'implement', 'debug', 'explain', 'write tests',
  'analyze', 'architecture', 'migrate', 'optimize', 'design',
];

/** Single-word commands that never need a full model. */
const TRIVIAL_COMMANDS = new Set([
  'yes', 'no', 'ok', 'okay', 'continue', 'next', 'done', 'skip',
  'y', 'n', 'sure', 'thanks', 'stop', 'cancel', 'retry', 'help',
]);

/** Prefixes for simple factual questions (case-insensitive). */
const SIMPLE_QUESTION_PREFIXES = [
  'what is', 'what are', 'how do i', 'how to', 'where is', 'where are',
  'who is', 'when is', 'when was', 'can i', 'is there',
];

/** Keywords that signal multi-file refactoring → always full. */
const MULTI_FILE_KEYWORDS = [
  'across files', 'all files', 'every file', 'multiple files',
  'rename across', 'move to', 'restructure', 'reorganize',
  'mass rename', 'bulk edit', 'codemod',
];

export function classifyQuery(input: string, history: Message[]): ModelTier {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const words = trimmed.split(/\s+/).filter(Boolean);

  // ── Trivial single-word commands → fast ──
  if (words.length === 1 && TRIVIAL_COMMANDS.has(lower)) return 'fast';

  // ── Explicit complexity signals → full ──
  if (COMPLEXITY_KEYWORDS.some(kw => lower.includes(kw))) return 'full';
  if (MULTI_FILE_KEYWORDS.some(kw => lower.includes(kw))) return 'full';
  if (trimmed.length > 200) return 'full';
  if (history.length > 10) return 'full';
  if (trimmed.includes('```') || trimmed.includes('`')) return 'full';
  if (/https?:\/\//.test(trimmed)) return 'full';
  if (trimmed.includes('\n')) return 'full';

  // ── Short + few words → fast ──
  if (trimmed.length < 160 && words.length < 28) return 'fast';

  // ── Simple factual questions under 100 chars → fast ──
  if (trimmed.length < 100 && SIMPLE_QUESTION_PREFIXES.some(p => lower.startsWith(p))) return 'fast';

  // ── Short message / few words → fast ──
  if (words.length <= 12 && trimmed.length <= 80) return 'fast';

  return 'full';
}

/**
 * Tier → model. NVIDIA MiniMax is the post-Firepass default (2026-04-18+).
 * Fireworks is only reached when the user explicitly selects a Fireworks
 * model ID or sets DIRGHA_PROVIDER=fireworks — no automatic default path
 * routes there, because the Firepass router now 429s server-side and
 * other Fireworks models bill per-token.
 */
export function resolveModel(tier: ModelTier, preferredModel?: string): string {
  if (preferredModel && preferredModel !== 'auto') return preferredModel;

  // Explicit user selection always wins (set via `dirgha models switch`)
  const explicit = process.env['DIRGHA_LOCAL_MODEL'] || process.env['DIRGHA_CODE_MODEL'];
  if (explicit) return explicit;

  const provider = getActiveProvider();

  // Explicit Fireworks opt-in — user set DIRGHA_PROVIDER=fireworks themselves.
  // Kept so a user who gets Firepass back can still use it without code changes.
  if (provider === 'fireworks' && process.env['FIREWORKS_API_KEY']) {
    return 'accounts/fireworks/routers/kimi-k2p5-turbo';
  }

  switch (provider) {
    case 'nvidia':
      return tier === 'fast'
        ? 'moonshotai/kimi-k2-instruct-0905'
        : 'minimaxai/minimax-m2.7';
    case 'anthropic':
      return tier === 'fast' ? 'claude-haiku-4-5' : 'claude-opus-4-7';
    case 'openai':
      return tier === 'fast' ? 'gpt-5.4-mini' : 'gpt-5.4';
    case 'gemini':
      return tier === 'fast' ? 'gemini-3.1-flash' : 'gemini-3.1-pro-preview';
    case 'groq':
      return tier === 'fast' ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile';
    case 'gateway':
      // Subscription users: gateway picks the best available (now MiniMax).
      return 'dirgha:minimax';
    default:
      switch (tier) {
        case 'fast': return process.env['DIRGHA_FAST_MODEL'] ?? 'claude-haiku-4-5';
        case 'full': return process.env['DIRGHA_CODE_MODEL'] ?? 'claude-sonnet-4-6';
        default:     return 'claude-sonnet-4-6';
      }
  }
}
