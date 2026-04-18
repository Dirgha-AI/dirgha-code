/**
 * compaction.ts — 4-tier context compaction
 *
 * Tier 1: Snip         — drop middle messages (>60 msgs)
 * Tier 2: Microcompact — summarize tool result blocks to 1-2 sentences (>80k tokens)
 * Tier 3: Collapse     — summarize middle turns to paragraphs (>120k tokens)
 * Tier 4: Full         — full history summarization to briefing (>160k tokens)
 *
 * Triggers cascade upward. Each tier is attempted; if still over threshold, escalates.
 */
import type { Message } from '../types.js';
import { callGateway } from './gateway.js';
import { resolveModel } from './routing.js';
import { isBelowThreshold, estimateMessagesTokens } from '../utils/token-counter.js';
import { summarizeToolPairs, progressiveMiddleOut } from './compaction-tiers.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const TIER1_MSG_THRESHOLD  =  60;
const TIER2_TOKEN_THRESHOLD =  80_000;
const TIER3_TOKEN_THRESHOLD = 120_000;
const TIER4_TOKEN_THRESHOLD = 160_000;

const SUMMARY_SYSTEM = `You are a context compaction assistant. Summarize the coding session into EXACTLY this structured format. Be concise but complete. Output ONLY these five sections, nothing else.

## Goal
[What the user is trying to accomplish — one or two sentences]

## Progress
[What has been done so far — bullet list of completed steps]

## Decisions
[Key decisions made and why — bullet list]

## Files Modified
[List of files changed with brief description — bullet list with full paths]

## Next Steps
[What still needs to be done — bullet list]`;

export async function shouldCompact(messages: Message[], modelId = DEFAULT_MODEL): Promise<boolean> {
  return !isBelowThreshold(messages, modelId);
}

export async function compactMessages(messages: Message[], modelId?: string): Promise<{ messages: Message[]; tier: number }> {
  if (messages.length <= 8) return { messages, tier: 0 };

  const effectiveModel = modelId ?? DEFAULT_MODEL;
  const tokenCount = estimateMessagesTokens(messages);

  // Tier 1: Snip — drop middle when message count too high
  if (messages.length > TIER1_MSG_THRESHOLD) {
    const head = messages.slice(0, 4);
    const tail = messages.slice(-12);
    const mid = messages.slice(4, messages.length - 12);
    // Keep every 3rd middle message
    const thinned = mid.filter((_, i) => i % 3 === 0);
    const tier1 = [...head, { role: 'user' as const, content: `[${mid.length - thinned.length} messages removed for context]` }, ...thinned, ...tail];
    if (isBelowThreshold(tier1, effectiveModel)) {
      console.error('[Compaction] Tier 1 (snip): ', messages.length, '→', tier1.length, 'messages');
      return { messages: tier1, tier: 1 };
    }
  }

  // Tier 2: Microcompact — summarize tool result blocks
  if (tokenCount > TIER2_TOKEN_THRESHOLD) {
    const tier2 = summarizeToolPairs(messages);
    if (isBelowThreshold(tier2, effectiveModel)) {
      console.error('[Compaction] Tier 2 (microcompact):', messages.length, '→', tier2.length, 'messages');
      return { messages: tier2, tier: 2 };
    }
  }

  // Tier 3: Collapse — LLM summarizes middle turns
  if (tokenCount > TIER3_TOKEN_THRESHOLD) {
    try {
      const tier3 = await llmCollapse(messages, effectiveModel);
      if (isBelowThreshold(tier3, effectiveModel)) {
        console.error('[Compaction] Tier 3 (collapse): LLM-summarized middle turns');
        return { messages: tier3, tier: 3 };
      }
    } catch (err) {
      console.error('[Compaction] Tier 3 LLM failed:', (err as Error).message);
    }
  }

  // Tier 4: Full — summarize entire history
  if (tokenCount > TIER4_TOKEN_THRESHOLD) {
    try {
      const tier4 = await llmSummarize(messages, effectiveModel);
      console.error('[Compaction] Tier 4 (full summarization)');
      return { messages: tier4, tier: 4 };
    } catch (err) {
      console.error('[Compaction] Tier 4 LLM failed:', (err as Error).message);
    }
  }

  // Fallback: progressive middle-out
  const fallback = progressiveMiddleOut(messages, effectiveModel);
  return { messages: fallback.length < messages.length ? fallback : messages.slice(-8), tier: 3 };
}

/** Tier 3: LLM summarizes ONLY the middle turns (preserves head/tail). */
async function llmCollapse(messages: Message[], modelId: string): Promise<Message[]> {
  if (messages.length <= 16) return messages;
  const head = messages.slice(0, 4);
  const tail = messages.slice(-8);
  const middle = messages.slice(4, messages.length - 8);

  const middleText = middle.map(m => {
    const text = typeof m.content === 'string' ? m.content
      : Array.isArray(m.content) ? (m.content as any[]).map((b: any) => b.text ?? '').join(' ') : '';
    return `${m.role}: ${text.slice(0, 300)}`;
  }).join('\n');

  const fastModel = resolveModel('fast');
  const resp = await callGateway(
    [{ role: 'user', content: `Summarize these conversation turns as brief bullet points:\n\n${middleText}` }],
    'You are a context compaction assistant. Output only bullet points. Be very concise.',
    fastModel,
  );

  const summaryText = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text ?? '').join('');
  if (!summaryText.trim()) throw new Error('Empty collapse summary');

  return [...head, { role: 'user' as const, content: `[Middle turns summarized]\n${summaryText}` }, ...tail];
}

async function llmSummarize(messages: Message[], modelId: string): Promise<Message[]> {
  const fastModel = resolveModel('fast');

  const historyText = messages.map(m => {
    const text = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? (m.content as any[]).map((b: any) => b.text ?? b.content ?? '').join(' ')
        : '';
    return `${m.role}: ${text.slice(0, 500)}`;
  }).join('\n');

  const summaryResponse = await callGateway(
    [{ role: 'user', content: `Summarize this coding session:\n\n${historyText}` }],
    SUMMARY_SYSTEM,
    fastModel,
  );

  const summaryText = summaryResponse.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text ?? '')
    .join('');

  if (!summaryText) throw new Error('Empty summary');

  // Quality check: reject if summary > 50% of original (inflated)
  if (summaryText.length > historyText.length * 0.5) {
    throw new Error('Summary inflated — skipping');
  }

  const snapshot: Message = {
    role: 'user',
    content: `[Context compacted]\n\n${summaryText}`,
  };
  return [snapshot, ...messages.slice(-4)];
}
