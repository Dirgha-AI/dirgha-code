/**
 * renderer.ts — Streaming markdown renderer + braille spinner for Dirgha CLI v2.
 *
 * Braille spinner: 10 frames, 80ms interval. States: thinking (blue) → tool (blue) → done (green) → error (red)
 * Markdown: inline bold/italic/code + code blocks with language labels, wraps at terminal width.
 */
import chalk from 'chalk';
import { getTheme } from './themes.js';

// ---------------------------------------------------------------------------
// Braille Spinner
// ---------------------------------------------------------------------------

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private label = '';
  private active = false;

  start(label = 'Thinking...'): void {
    if (this.active) return;
    this.label = label;
    this.frame = 0;
    this.active = true;
    process.stdout.write('\x1B[?25l'); // hide cursor
    this.interval = setInterval(() => {
      const spinner = chalk.blue(FRAMES[this.frame % FRAMES.length]);
      process.stdout.write(`\r${spinner} ${chalk.dim(this.label)}  `);
      this.frame++;
    }, 80);
  }

  update(label: string): void {
    this.label = label;
  }

  stop(success = true, finalMsg?: string): void {
    if (!this.active) return;
    this.active = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    const icon = success ? chalk.green('✓') : chalk.red('✗');
    const msg = finalMsg ?? (success ? 'Done' : 'Failed');
    process.stdout.write(`\r${icon} ${chalk.dim(msg)}\n`);
    process.stdout.write('\x1B[?25h'); // show cursor
  }

  clear(): void {
    this.active = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write('\r\x1B[K');
    process.stdout.write('\x1B[?25h');
  }

  isSpinning(): boolean {
    return this.active;
  }
}

// ---------------------------------------------------------------------------
// Inline markdown transforms
// ---------------------------------------------------------------------------

const TERM_WIDTH = () => process.stdout.columns ?? 80;

function applyInline(line: string, t = getTheme()): string {
  // Bold: **text**
  line = line.replace(/\*\*(.+?)\*\*/g, (_, m) => t.bold(m));
  // Italic: *text* or _text_
  line = line.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, m) => chalk.italic(m));
  line = line.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, (_, m) => chalk.italic(m));
  // Inline code: `code`
  line = line.replace(/`([^`]+)`/g, (_, m) => t.code(m));
  // Links: [text](url)
  line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => `${chalk.underline(text)} ${chalk.dim(`(${url})`)}`);
  return line;
}

function wordWrap(text: string, width: number): string {
  if (text.length <= width) return text;
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Block renderer (streaming-safe)
// ---------------------------------------------------------------------------

interface RendererState {
  inCodeBlock: boolean;
  lang: string;
  buffer: string;
}

function createRendererState(): RendererState {
  return { inCodeBlock: false, lang: '', buffer: '' };
}

function processLine(line: string, state: RendererState, t = getTheme()): string {
  const trimmed = line.trimEnd();

  // Code block start: ```lang
  if (!state.inCodeBlock && /^```(\w*)/.test(trimmed)) {
    state.inCodeBlock = true;
    state.lang = trimmed.replace(/^```/, '') || 'code';
    return t.dim(`┌─ ${state.lang} ${'─'.repeat(Math.max(0, 20 - state.lang.length))}`);
  }

  // Code block end: ```
  if (state.inCodeBlock && trimmed === '```') {
    state.inCodeBlock = false;
    return t.dim('└' + '─'.repeat(22));
  }

  // Inside code block
  if (state.inCodeBlock) {
    return t.dim('│ ') + t.code(trimmed);
  }

  // Headers
  if (/^### (.+)/.test(trimmed)) return t.header(trimmed.replace(/^### /, ''));
  if (/^## (.+)/.test(trimmed)) return t.header(trimmed.replace(/^## /, ''));
  if (/^# (.+)/.test(trimmed)) return t.header(trimmed.replace(/^# /, ''));

  // Bullet list
  if (/^[-*] (.+)/.test(trimmed)) {
    const content = applyInline(trimmed.replace(/^[-*] /, ''), t);
    return `  ${t.primary('•')} ${wordWrap(content, TERM_WIDTH() - 4)}`;
  }

  // Numbered list
  if (/^\d+\. (.+)/.test(trimmed)) {
    const [, num, content] = trimmed.match(/^(\d+)\. (.+)/) ?? [];
    return `  ${t.dim(`${num}.`)} ${applyInline(content, t)}`;
  }

  // Empty line
  if (!trimmed) return '';

  // Regular paragraph
  return wordWrap(applyInline(trimmed, t), TERM_WIDTH());
}

// ---------------------------------------------------------------------------
// Partial line renderer (no state mutations — safe to call mid-line)
// ---------------------------------------------------------------------------

function renderPartialLine(text: string, state: RendererState, t = getTheme()): string {
  if (state.inCodeBlock) return t.dim('│ ') + t.code(text);
  return applyInline(text.trimEnd(), t);
}

// ---------------------------------------------------------------------------
// Primary streaming renderer
// ---------------------------------------------------------------------------

export class StreamingRenderer {
  private state = createRendererState();
  private partial = '';
  private partialOnScreen = false;

  feed(chunk: string): void {
    this.partial += chunk;
    const lines = this.partial.split('\n');
    this.partial = lines.pop() ?? '';

    for (const line of lines) {
      if (this.partialOnScreen) {
        process.stdout.write('\r\x1B[K');
        this.partialOnScreen = false;
      }
      const rendered = processLine(line, this.state);
      console.log(rendered);
    }

    // Show partial in-place so tokens appear as they arrive, not in bursts
    if (this.partial) {
      const rendered = renderPartialLine(this.partial, this.state);
      process.stdout.write('\r\x1B[K' + rendered);
      this.partialOnScreen = true;
    }
  }

  flush(): void {
    if (this.partial) {
      if (this.partialOnScreen) {
        process.stdout.write('\r\x1B[K');
        this.partialOnScreen = false;
      }
      console.log(processLine(this.partial, this.state));
      this.partial = '';
    }
  }

  reset(): void {
    this.state = createRendererState();
    this.partial = '';
    this.partialOnScreen = false;
  }
}

/** Render a complete markdown string at once (non-streaming). */
export function renderMarkdown(text: string): void {
  const renderer = new StreamingRenderer();
  renderer.feed(text);
  renderer.flush();
}

// ---------------------------------------------------------------------------
// Gemini-style rounded tool box
// ---------------------------------------------------------------------------

const TOOL_ICONS: Record<string, string> = {
  read_file: '▸', write_file: '◆', edit_file: '◆', edit_file_all: '◆',
  bash: '$', glob: '~', grep: '~', web_search: '@', web_fetch: '@',
  delete_file: '✕', make_dir: '+', apply_patch: '∂',
  read_memory: '◇', write_memory: '◇', list_dir: '▾',
};

const PRIMARY_KEYS = ['path', 'command', 'pattern', 'query', 'url'];
const TERM_W = () => process.stdout.columns ?? 80;

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** Claude Code-style single-line tool call with optional compact diff rows. */
export function renderToolBox(
  name: string,
  input: Record<string, unknown>,
  elapsedMs = 0,
  _t = getTheme(),
): void {
  const icon = TOOL_ICONS[name] ?? '◆';
  const label = name.replace(/_/g, ' ');

  // Find primary arg to show inline: first key from priority list that exists
  const primaryKey = PRIMARY_KEYS.find(k => k in input);
  const primaryVal = primaryKey ? trunc(String(input[primaryKey] ?? ''), 60) : '';
  const elapsed = elapsedMs > 0 ? chalk.dim(`  ${elapsedMs}ms`) : '';

  const header = chalk.cyan(icon) + ' ' + chalk.white(label)
    + (primaryVal ? chalk.dim('(') + chalk.dim(primaryVal) + chalk.dim(')') : '')
    + elapsed;
  process.stdout.write(header + '\n');

  // Compact diff rows for edit tools only
  if ('old_string' in input || 'new_string' in input) {
    const maxW = TERM_W() - 4;
    if (input.old_string) {
      for (const line of String(input.old_string).split('\n').slice(0, 3)) {
        process.stdout.write(chalk.red('  - ') + chalk.dim(trunc(line, maxW)) + '\n');
      }
    }
    if (input.new_string) {
      for (const line of String(input.new_string).split('\n').slice(0, 3)) {
        process.stdout.write(chalk.green('  + ') + trunc(line, maxW) + '\n');
      }
    }
  }
}
