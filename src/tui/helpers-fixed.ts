/** tui/helpers.ts — Pure helpers: markdown, history, editor, uid */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import { marked } from 'marked';
// @ts-ignore
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';
import { highlight } from './syntax.js';
import { MODELS } from './constants.js';

// marked-terminal v7: `code` option is a chalk formatter, not (code, lang).
// We intercept code blocks before passing to marked so we get the lang.
marked.use(markedTerminal({ reflowText: false, tab: 2, code: (s: string) => s }));

/** Replace code fences with syntax-highlighted blocks, leave prose for marked-terminal. */
function applyCodeHighlighting(text: string): string {
  return text.replace(/^```(\w*)\n([\s\S]*?)^```/gm, (_m, lang: string, code: string) => {
    const langTag = lang ? chalk.hex('#858585')(lang) + '\n' : '';
    const body = highlight(code.replace(/\n$/, ''), lang || undefined);
    return `\x00CODE\x00${langTag}${body}\x00END\x00`;
  });
}

export function renderMd(text: string): string {
  try {
    const preProcessed = applyCodeHighlighting(text);
    const rendered = String(marked(preProcessed)).trimEnd();
    // Restore code blocks: marked-terminal may have escaped our markers — clean up
    return rendered.replace(/\x00CODE\x00([\s\S]*?)\x00END\x00/g, '\n$1\n');
  } catch { return text; }
}

/** Buffer streaming markdown chunks, flush only at safe boundaries (goose pattern) 
 * 
 * FIXED: Added forceFlush for stalled streams and maxBuffer protection
 */
export class MarkdownBuffer {
  private buf = '';
  private lastFlushTime = Date.now();
  private flushTimeout: NodeJS.Timeout | null = null;
  private maxBufferSize = 10000; // Force flush if buffer gets too large

  push(chunk: string): string {
    this.buf += chunk;
    
    // Check if buffer is getting too large - force flush
    if (this.buf.length > this.maxBufferSize) {
      return this.forceFlush();
    }
    
    const lines = this.buf.split('\n');
    let safeIdx = 0; let fence = false;
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^```/.test(lines[i]!)) fence = !fence;
      if (!fence) safeIdx = i + 1;
    }
    const safe = lines.slice(0, safeIdx).join('\n');
    this.buf = lines.slice(safeIdx).join('\n');
    
    if (safe) {
      this.lastFlushTime = Date.now();
    }
    
    return safe;
  }

  /** Force flush entire buffer regardless of state */
  forceFlush(): string {
    const out = this.buf;
    this.buf = '';
    this.lastFlushTime = Date.now();
    return out;
  }

  /** Normal flush - for stream end */
  flush(): string { 
    return this.forceFlush(); 
  }
  
  /** Check if buffer has been stalled (no flush for 2+ seconds) */
  isStalled(): boolean {
    return this.buf.length > 0 && (Date.now() - this.lastFlushTime) > 2000;
  }
  
  /** Get current buffer size for debugging */
  getBufferSize(): number {
    return this.buf.length;
  }
}

/** Auto-flushing wrapper for streaming - prevents stuck terminals */
export function createStreamingRenderer(onChunk: (text: string) => void) {
  const buffer = new MarkdownBuffer();
  let flushInterval: NodeJS.Timeout | null = null;
  
  // Set up auto-flush every 500ms to prevent stuck terminal
  flushInterval = setInterval(() => {
    if (buffer.isStalled()) {
      const stalled = buffer.forceFlush();
      if (stalled) onChunk(stalled);
    }
  }, 500);
  
  return {
    push: (chunk: string) => {
      const safe = buffer.push(chunk);
      if (safe) onChunk(safe);
    },
    end: () => {
      if (flushInterval) clearInterval(flushInterval);
      const remaining = buffer.flush();
      if (remaining) onChunk(remaining);
    },
    // Emergency flush for when user presses key
    forceFlush: () => {
      const forced = buffer.forceFlush();
      if (forced) onChunk(forced);
    }
  };
}

const HISTORY_FILE = path.join(os.homedir(), '.dirgha', 'history');

export function loadHistory(): string[] {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean).slice(-500);
  } catch { return []; }
}

export function saveHistory(entry: string) {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.appendFileSync(HISTORY_FILE, entry + '\n', 'utf8');
  } catch { /* ignore */ }
}

/** Open $EDITOR on a temp file — returns edited content */
export function openInEditor(initialText: string): string {
  const editor = process.env['VISUAL'] ?? process.env['EDITOR'] ?? 'vi';
  const tmp = path.join(os.tmpdir(), `dirgha_edit_${Date.now()}.md`);
  try {
    fs.writeFileSync(tmp, initialText, 'utf8');
    spawnSync(editor, [tmp], { stdio: 'inherit' });
    const result = fs.readFileSync(tmp, 'utf8').trim();
    fs.unlinkSync(tmp);
    return result;
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    return initialText;
  }
}

export function uid() { return crypto.randomUUID().slice(0, 8); }
export function formatTokens(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }
export function truncate(s: string, max: number): string { return s.length > max ? s.slice(0, max) + '…' : s; }
export function hhmm(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
export function modelLabel(id: string) {
  return MODELS.find(m => m.id === id)?.label ?? id.split('/').pop() ?? id;
}
export function provLabel(p: string) {
  const m: Record<string, string> = {
    fireworks: 'Fireworks', anthropic: 'Anthropic',
    openai: 'OpenAI', gemini: 'Google',
    openrouter: 'OpenRouter', nvidia: 'NVIDIA',
    litellm: 'Local', gateway: 'Gateway',
  };
  return m[p.toLowerCase()] ?? p;
}
