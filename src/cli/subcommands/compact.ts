/**
 * `dirgha compact [sessionId]` — force-compact a session on disk.
 *
 * Reads the session JSONL, drops intermediate tool-result and thinking
 * parts from older messages, and appends a `compaction` entry that
 * records the rough token savings. The in-repl compaction pass is
 * richer (LLM summarisation), but this is intentionally offline: safe
 * to run without any provider access.
 *
 * When `sessionId` is omitted we pick the most recently modified
 * session in `~/.dirgha/sessions/`.
 */

import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout, stderr } from 'node:process';
import { createSessionStore, type SessionEntry } from '../../context/session.js';
import type { Message, ContentPart } from '../../kernel/types.js';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

function estimateTokens(entry: SessionEntry): number {
  if (entry.type !== 'message') return 0;
  const text = typeof entry.message.content === 'string'
    ? entry.message.content
    : entry.message.content.map(partText).join('');
  return Math.ceil(text.length / 4);
}

function partText(part: ContentPart): string {
  if (part.type === 'text' || part.type === 'thinking') return part.text;
  if (part.type === 'tool_result') return part.content;
  return JSON.stringify(part);
}

function compactMessage(message: Message, olderThanIdx: number, myIdx: number): Message {
  // Strip verbose tool_result/thinking content from older messages.
  if (myIdx >= olderThanIdx) return message;
  if (typeof message.content === 'string') return message;
  const pruned: ContentPart[] = message.content.map(part => {
    if (part.type === 'thinking') return { type: 'text', text: '[thinking elided]' };
    if (part.type === 'tool_result') {
      const trimmed = part.content.length > 200 ? `${part.content.slice(0, 200)}… [elided]` : part.content;
      return { type: 'tool_result', toolUseId: part.toolUseId, content: trimmed, isError: part.isError };
    }
    return part;
  });
  return { ...message, content: pruned };
}

async function mostRecentSession(): Promise<string | undefined> {
  const dir = join(homedir(), '.dirgha', 'sessions');
  const files = await readdir(dir).catch(() => [] as string[]);
  let best: { id: string; mtime: number } | undefined;
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue;
    const info = await stat(join(dir, file)).catch(() => undefined);
    if (!info) continue;
    if (!best || info.mtimeMs > best.mtime) best = { id: file.replace(/\.jsonl$/, ''), mtime: info.mtimeMs };
  }
  return best?.id;
}

export const compactSubcommand: Subcommand = {
  name: 'compact',
  description: 'Force-compact a session on disk (token savings summary)',
  async run(argv): Promise<number> {
    const sessionId = argv[0] ?? await mostRecentSession();
    if (!sessionId) { stderr.write('no sessions found\n'); return 1; }

    const store = createSessionStore();
    const session = await store.open(sessionId);
    if (!session) { stderr.write(`session "${sessionId}" not found\n`); return 1; }

    const entries: SessionEntry[] = [];
    for await (const entry of session.replay()) entries.push(entry);

    const beforeTokens = entries.reduce((sum, e) => sum + estimateTokens(e), 0);
    const messageIndices: number[] = [];
    entries.forEach((e, i) => { if (e.type === 'message') messageIndices.push(i); });
    // Keep the last 6 messages intact; elide older ones.
    const keepFrom = messageIndices.length > 6 ? messageIndices[messageIndices.length - 6] : 0;

    let afterTokens = 0;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.type === 'message') {
        const pruned = compactMessage(entry.message, keepFrom, i);
        entries[i] = { ...entry, message: pruned };
      }
      afterTokens += estimateTokens(entries[i]);
    }

    const saved = Math.max(0, beforeTokens - afterTokens);
    await session.append({
      type: 'compaction',
      ts: new Date().toISOString(),
      keptFrom: String(keepFrom),
      summary: `offline compact: ${saved} tokens elided`,
    });

    stdout.write(`${style(defaultTheme.success, '✓')} compacted ${sessionId}\n`);
    stdout.write(`  before  ~${beforeTokens} tokens\n`);
    stdout.write(`  after   ~${afterTokens} tokens\n`);
    const pct = beforeTokens > 0 ? Math.round((saved / beforeTokens) * 100) : 0;
    stdout.write(`  saved   ~${saved} (${pct}%)\n`);
    return 0;
  },
};
