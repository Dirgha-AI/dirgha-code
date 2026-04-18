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
// Primary streaming renderer
// ---------------------------------------------------------------------------

export class StreamingRenderer {
  private state = createRendererState();
  private partial = '';

  /**
   * Feed a chunk of streamed text. Renders complete lines immediately.
   * Returns any pending partial line (incomplete).
   */
  feed(chunk: string): void {
    this.partial += chunk;
    const lines = this.partial.split('\n');
    this.partial = lines.pop() ?? '';

    for (const line of lines) {
      const rendered = processLine(line, this.state);
      console.log(rendered);
    }
  }

  /** Flush any remaining partial line at end of stream. */
  flush(): void {
    if (this.partial) {
      console.log(processLine(this.partial, this.state));
      this.partial = '';
    }
  }

  reset(): void {
    this.state = createRendererState();
    this.partial = '';
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

const BOX_W = () => Math.min(process.stdout.columns ?? 80, 80);

// Single-column BMP chars only — emoji have unpredictable terminal widths
const TOOL_ICONS: Record<string, string> = {
  read_file: '▸', write_file: '◆', edit_file: '◆', edit_file_all: '◆',
  bash: '$', glob: '~', grep: '~', web_search: '@', web_fetch: '@',
  delete_file: '✕', make_dir: '+', apply_patch: '∂',
  read_memory: '◇', write_memory: '◇', list_dir: '▾',
};

/** Render a Gemini-style rounded box for a tool call.
 *  Thoughts appear outside; this box wraps commands/edits.
 *  @param elapsedMs elapsed milliseconds since last tool (0 to omit) */
export function renderToolBox(
  name: string,
  input: Record<string, unknown>,
  elapsedMs = 0,
  t = getTheme(),
): void {
  const width = BOX_W();
  const inner = width - 4; // 2 border + 2 padding

  const icon = TOOL_ICONS[name] ?? '◆';
  const label = name.replace(/_/g, ' ');
  const elapsedLabel = elapsedMs > 0 ? `  ${elapsedMs}ms` : '';
  const headerPlain = `${icon} ${label}${elapsedLabel}`;

  // Top border: `╭─ ` (3) + header + ` ` (1) + fill + `╮` (1) = header + fill + 5
  const fillLen = Math.max(0, width - headerPlain.length - 5);
  const fill = '─'.repeat(fillLen);
  process.stdout.write(chalk.cyan('╭─ ') + chalk.bold.cyan(icon) + ' ' + chalk.white(label) + chalk.dim(elapsedLabel) + ' ' + chalk.cyan(fill + '╮') + '\n');

  // Key fields to display
  const SHOW_KEYS = ['path', 'command', 'pattern', 'query', 'url', 'old_string', 'new_string'];
  for (const key of SHOW_KEYS) {
    if (!(key in input)) continue;
    const raw = String(input[key] ?? '');

    if (key === 'old_string' || key === 'new_string') {
      const prefix = key === 'old_string' ? chalk.red('- ') : chalk.green('+ ');
      const rawLines = raw.split('\n');
      for (const line of rawLines.slice(0, 4)) {
        const truncated = line.slice(0, inner - 4);
        const pad = ' '.repeat(Math.max(0, inner - truncated.length - 2));
        process.stdout.write(chalk.cyan('│ ') + prefix + truncated + pad + chalk.cyan(' │') + '\n');
      }
      if (rawLines.length > 4) {
        const more = `  … +${rawLines.length - 4} lines`;
        const pad = ' '.repeat(Math.max(0, inner - more.length));
        process.stdout.write(chalk.cyan('│ ') + chalk.dim(more) + pad + chalk.cyan(' │') + '\n');
      }
    } else {
      const valueMax = inner - key.length - 4; // "key: " + padding
      const valueStr = raw.slice(0, Math.max(0, valueMax));
      const visibleLen = key.length + 2 + valueStr.length; // "key: value"
      const pad = ' '.repeat(Math.max(0, inner - visibleLen));
      process.stdout.write(chalk.cyan('│ ') + chalk.dim(key + ': ') + chalk.white(valueStr) + pad + chalk.cyan(' │') + '\n');
    }
  }

  void t; // theme reserved for future colour overrides
  process.stdout.write(chalk.cyan('╰' + '─'.repeat(width - 2) + '╯') + '\n');
}
