/**
 * input.ts — Vim-mode line editor for Dirgha CLI v2.
 *
 * Modes: INSERT (default) and NORMAL.
 * Normal mode keys: hjkl, w/b, 0/$, i/a/I/A, x, dd, cc, u, Esc (no-op)
 * Special: Ctrl+C → exit, Ctrl+D → exit, Tab → basic completion
 */
import chalk from 'chalk';
import type { ReplContext } from '../types.js';

type Mode = 'INSERT' | 'NORMAL';

interface EditorState {
  mode: Mode;
  line: string;
  cursor: number;
  history: string[];
  historyIndex: number;
  undoStack: string[];
}

function modeIndicator(mode: Mode): string {
  return mode === 'INSERT'
    ? chalk.cyan('-- INSERT --')
    : chalk.yellow('-- NORMAL --');
}

function moveCursorToCol(col: number): void {
  process.stdout.write(`\x1B[${col + 1}G`);
}

function redrawLine(prompt: string, state: EditorState): void {
  const termWidth = process.stdout.columns || 80;
  const prefixLen = 2; // '▸ '
  const totalLen = prefixLen + state.line.length;
  const rows = Math.max(1, Math.ceil(totalLen / termWidth));

  // Move up to first row if text wrapped to multiple rows
  if (rows > 1) {
    process.stdout.write(`\x1B[${rows - 1}A`);
  }

  // Clear all rows from top to bottom
  for (let i = 0; i < rows; i++) {
    process.stdout.write('\r\x1B[K');
    if (i < rows - 1) process.stdout.write('\x1B[B');
  }

  // Move back to top row
  if (rows > 1) {
    process.stdout.write(`\x1B[${rows - 1}A`);
  }

  // Write indicator and line content
  const indicator = state.mode === 'NORMAL' ? chalk.yellow('▸ ') : chalk.cyan('▸ ');
  process.stdout.write(indicator + state.line);

  // Position cursor at correct row+col
  const absoluteOffset = prefixLen + state.cursor;
  const cursorRow = Math.floor(absoluteOffset / termWidth);
  const cursorCol = absoluteOffset % termWidth;

  // We are currently at end of content; move up to cursor row if needed
  const contentEndRow = Math.floor(totalLen / termWidth);
  const rowDiff = contentEndRow - cursorRow;
  if (rowDiff > 0) {
    process.stdout.write(`\x1B[${rowDiff}A`);
  }

  // Move to correct column
  if (cursorCol > 0) {
    process.stdout.write(`\x1B[${cursorCol + 1}G`);
  } else {
    process.stdout.write('\r');
  }
}

function wordForward(line: string, cursor: number): number {
  let i = cursor;
  // skip current word
  while (i < line.length && /\w/.test(line[i]!)) i++;
  // skip spaces
  while (i < line.length && !/\w/.test(line[i]!)) i++;
  return i;
}

function wordBack(line: string, cursor: number): number {
  let i = cursor - 1;
  // skip spaces
  while (i > 0 && !/\w/.test(line[i]!)) i--;
  // skip word
  while (i > 0 && /\w/.test(line[i - 1]!)) i--;
  return Math.max(0, i);
}

export interface InputOptions {
  prompt?: string;
  completions?: (partial: string, ctx: ReplContext) => string[];
  ctx?: ReplContext;
  vimMode?: boolean;
}

/**
 * Read a single line of input with optional vim keybindings.
 * Resolves with the entered string, or null on Ctrl+C/Ctrl+D.
 */
export function readLine(opts: InputOptions = {}): Promise<string | null> {
  const { completions, ctx, vimMode = false } = opts;

  return new Promise((resolve) => {
    const state: EditorState = {
      mode: 'INSERT',
      line: '',
      cursor: 0,
      history: [],
      historyIndex: -1,
      undoStack: [],
    };

    const prompt = chalk.cyan('▸ ');

    process.stdout.write(prompt);

    if (!process.stdin.isTTY || !vimMode) {
      // Fallback: simple readline
      const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });
      rl.question('', (line: string) => {
        rl.close();
        resolve(line);
      });
      rl.on('close', () => resolve(null));
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    // Paste detection: buffer rapid multi-char input
    let pasteBuffer = '';
    let pasteCharCount = 0;
    let lastKeyTime = 0;
    const PASTE_THRESHOLD_MS = 5;   // chars arriving < 5ms apart = paste
    const PASTE_MIN_CHARS = 50;     // minimum chars to trigger paste mode

    const cleanup = (): void => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
    };

    const submit = (value: string): void => {
      cleanup();
      resolve(value);
    };

    const onData = (key: string): void => {
      const code = key.charCodeAt(0);

      // Ctrl+C or Ctrl+D
      if (code === 3 || code === 4) {
        cleanup();
        resolve(null);
        return;
      }

      // Enter / Return submits
      if (key === '\r' || key === '\n' || code === 13) {
        // If paste was detected, show summary before submitting
        if (pasteBuffer.length > 0) {
          const pastedText = pasteBuffer;
          pasteBuffer = '';
          pasteCharCount = 0;
          const lines = pastedText.split('\n');
          const lineCount = lines.length;
          // Show paste summary
          process.stdout.write('\n');
          process.stdout.write(chalk.dim(`  ┌─ ${lineCount} lines pasted (${pastedText.length} chars)\n`));
          // Show first 3 lines as preview
          const previewCount = Math.min(3, lineCount);
          for (let i = 0; i < previewCount; i++) {
            const preview = (lines[i] ?? '').slice(0, 72);
            process.stdout.write(chalk.dim(`  │ ${preview}${(lines[i]?.length ?? 0) > 72 ? '...' : ''}\n`));
          }
          if (lineCount > 6) {
            process.stdout.write(chalk.dim(`  │ ... ${lineCount - 6} more lines ...\n`));
            // Show last 3 lines
            for (let i = lineCount - 3; i < lineCount; i++) {
              const preview = (lines[i] ?? '').slice(0, 72);
              process.stdout.write(chalk.dim(`  │ ${preview}${(lines[i]?.length ?? 0) > 72 ? '...' : ''}\n`));
            }
          }
          process.stdout.write(chalk.dim(`  └──\n`));
          // Set line to full pasted content for submission
          state.line = pastedText;
          state.cursor = pastedText.length;
        }
        submit(state.line);
        return;
      }

      // Paste detection: if the key chunk has multiple chars (terminal sends
      // pasted text as one big data event), or if chars arrive < 5ms apart
      const now = Date.now();
      const gap = now - lastKeyTime;
      lastKeyTime = now;

      // Multi-char data event = definitely a paste
      if (key.length > 1 && !key.startsWith('\x1B')) {
        pasteBuffer += key;
        pasteCharCount += key.length;
        // Show progress indicator instead of dumping text
        process.stdout.write(`\r${chalk.dim(`  pasting... ${pasteCharCount} chars`)}`);
        return;
      }

      // Single char arriving very fast after previous = paste continuation
      if (gap < PASTE_THRESHOLD_MS && pasteCharCount > 0) {
        pasteBuffer += key;
        pasteCharCount++;
        if (pasteCharCount % 100 === 0) {
          process.stdout.write(`\r${chalk.dim(`  pasting... ${pasteCharCount} chars`)}`);
        }
        return;
      }

      // If we were pasting but gap is now large, paste ended without Enter
      // Flush paste buffer into line
      if (pasteBuffer.length > 0 && gap >= PASTE_THRESHOLD_MS) {
        state.line += pasteBuffer;
        state.cursor = state.line.length;
        const lines = pasteBuffer.split('\n');
        process.stdout.write(`\r\x1B[K`); // clear progress line
        process.stdout.write(chalk.dim(`  ${lines.length} lines pasted (${pasteBuffer.length} chars) — press Enter to submit\n`));
        pasteBuffer = '';
        pasteCharCount = 0;
        redrawLine(prompt, state);
        // Don't process this char as paste — fall through to normal handling
      }

      if (state.mode === 'INSERT') {
        handleInsert(key, code, state, completions, ctx);
      } else {
        handleNormal(key, state);
      }

      redrawLine(prompt, state);
    };

    process.stdin.on('data', onData);
  });
}

function handleInsert(
  key: string,
  code: number,
  state: EditorState,
  completions?: (partial: string, ctx: ReplContext) => string[],
  ctx?: ReplContext,
): void {
  // Escape → NORMAL mode
  if (key === '\x1B') {
    state.mode = 'NORMAL';
    state.cursor = Math.max(0, state.cursor - 1); // vim: cursor moves left on Esc
    return;
  }

  // Backspace
  if (code === 127 || key === '\b') {
    if (state.cursor > 0) {
      state.undoStack.push(state.line);
      state.line = state.line.slice(0, state.cursor - 1) + state.line.slice(state.cursor);
      state.cursor--;
    }
    return;
  }

  // Arrow keys (ANSI escape sequences)
  if (key === '\x1B[A') { // up — history back
    if (state.history.length > 0) {
      state.historyIndex = Math.min(state.historyIndex + 1, state.history.length - 1);
      state.line = state.history[state.history.length - 1 - state.historyIndex] ?? '';
      state.cursor = state.line.length;
    }
    return;
  }
  if (key === '\x1B[B') { // down — history forward
    if (state.historyIndex > 0) {
      state.historyIndex--;
      state.line = state.history[state.history.length - 1 - state.historyIndex] ?? '';
      state.cursor = state.line.length;
    } else if (state.historyIndex === 0) {
      state.historyIndex = -1;
      state.line = '';
      state.cursor = 0;
    }
    return;
  }
  if (key === '\x1B[C') { // right
    state.cursor = Math.min(state.cursor + 1, state.line.length);
    return;
  }
  if (key === '\x1B[D') { // left
    state.cursor = Math.max(0, state.cursor - 1);
    return;
  }

  // Tab — basic prefix completion
  if (code === 9 && completions && ctx) {
    const partial = state.line.slice(0, state.cursor);
    const suggestions = completions(partial, ctx);
    if (suggestions.length === 1 && suggestions[0]) {
      state.undoStack.push(state.line);
      state.line = suggestions[0] + state.line.slice(state.cursor);
      state.cursor = suggestions[0].length;
    } else if (suggestions.length > 1) {
      process.stdout.write('\n' + chalk.dim(suggestions.join('  ')) + '\n');
    }
    return;
  }

  // Printable characters
  if (code >= 32) {
    state.undoStack.push(state.line);
    state.line = state.line.slice(0, state.cursor) + key + state.line.slice(state.cursor);
    state.cursor++;
  }
}

function handleNormal(key: string, state: EditorState): void {
  switch (key) {
    case 'i':
      state.mode = 'INSERT';
      break;
    case 'a':
      state.mode = 'INSERT';
      state.cursor = Math.min(state.cursor + 1, state.line.length);
      break;
    case 'I':
      state.mode = 'INSERT';
      state.cursor = 0;
      break;
    case 'A':
      state.mode = 'INSERT';
      state.cursor = state.line.length;
      break;
    case 'h':
    case '\x1B[D': // left arrow in normal mode
      state.cursor = Math.max(0, state.cursor - 1);
      break;
    case 'l':
    case '\x1B[C': // right arrow in normal mode
      state.cursor = Math.min(state.cursor + 1, state.line.length - 1);
      break;
    case '0':
      state.cursor = 0;
      break;
    case '$':
      state.cursor = Math.max(0, state.line.length - 1);
      break;
    case 'w':
      state.cursor = wordForward(state.line, state.cursor);
      break;
    case 'b':
      state.cursor = wordBack(state.line, state.cursor);
      break;
    case 'x':
      if (state.line.length > 0) {
        state.undoStack.push(state.line);
        state.line = state.line.slice(0, state.cursor) + state.line.slice(state.cursor + 1);
        state.cursor = Math.min(state.cursor, Math.max(0, state.line.length - 1));
      }
      break;
    case 'd': // will catch 'dd' on second press — simplified: clear on 'd'
      state.undoStack.push(state.line);
      state.line = '';
      state.cursor = 0;
      break;
    case 'c':
      state.undoStack.push(state.line);
      state.line = '';
      state.cursor = 0;
      state.mode = 'INSERT';
      break;
    case 'u':
      if (state.undoStack.length > 0) {
        state.line = state.undoStack.pop()!;
        state.cursor = Math.min(state.cursor, state.line.length);
      }
      break;
  }
}
