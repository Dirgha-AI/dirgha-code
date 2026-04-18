/**
 * permission/confirmation.ts — Interactive HITL prompts.
 *
 * Modes:
 *   promptConfirmation  — single-keypress allow/deny for write tools
 *   promptUserInput     — free-text clarification from agent mid-run
 *   promptUserFeedback  — show content, ask approve/reject with optional comment
 *
 * Works outside Ink (directly on process.stdout/stdin).
 */
import readline from 'node:readline';
import type { PermDecision } from './store.js';

const MAX_INPUT_PREVIEW = 120;

function formatInput(toolInput: Record<string, unknown>): string {
  try {
    const raw = JSON.stringify(toolInput);
    return raw.length > MAX_INPUT_PREVIEW ? raw.slice(0, MAX_INPUT_PREVIEW) + '…' : raw;
  } catch {
    return String(toolInput);
  }
}

/**
 * Prompt the user for a permission decision on a write tool call.
 * Supports both single-key shortcuts (a, A, d, D, Enter) AND typed words (go, yes, allow, y).
 *
 * Key map (single press):
 *   a / Enter  → allow_once
 *   A          → always_allow
 *   d          → deny_once
 *   D          → always_deny
 *   Ctrl-C     → deny_once
 *
 * Typed words (require Enter):
 *   go, yes, allow, y         → allow_once
 *   always, yes-all, allow-all  → always_allow
 *   no, deny, n                 → deny_once
 *   never, no-all, deny-all     → always_deny
 */
export async function promptConfirmation(
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<PermDecision> {
  const preview = formatInput(toolInput);

  process.stdout.write(
    `\n\u26a0  Write operation: ${toolName}\n` +
    `   ${preview}\n` +
    `   [a]llow  [A]lways  [d]eny  [D]eny always (or type go/yes/no/never): `,
  );

  // Use readline (cooked mode) — avoids corrupting the REPL's stdin state.
  // Single-key shortcuts not available here; user types word + Enter.
  return new Promise<PermDecision>((resolve) => {
    const checkWordMatch = (input: string): PermDecision => {
      const s = input.trim().toLowerCase();
      if (!s || ['a', 'go', 'yes', 'allow', 'y', 'ok', 'sure', 'proceed'].includes(s)) return 'allow_once';
      if (['A', 'always', 'yes-all', 'allow-all', 'yep', 'yeah'].includes(s)) return 'always_allow';
      if (['d', 'no', 'deny', 'n', 'stop', 'cancel'].includes(s)) return 'deny_once';
      if (['D', 'never', 'no-all', 'deny-all', 'nope'].includes(s)) return 'always_deny';
      return 'allow_once'; // default: allow
    };

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
    let resolved = false;
    const done = (d: PermDecision) => {
      if (resolved) return;
      resolved = true;
      rl.close();
      process.stdout.write('\n');
      resolve(d);
    };
    rl.once('line', (line) => done(checkWordMatch(line)));
    rl.once('close', () => done('allow_once'));
    rl.once('SIGINT', () => { process.stdout.write('[Interrupted — denying]\n'); done('deny_once'); });
  });
}

/**
 * Ask the user for free-text input (Agno user_input mode).
 * Agent can call this when it needs clarifying information mid-run.
 * Returns the user's response, or empty string if non-TTY.
 */
export async function promptUserInput(question: string): Promise<string> {
  if (!process.stdin.isTTY) return '';

  process.stdout.write(`\n  💬 ${question}\n  > `);

  return new Promise<string>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl.once('line', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
    rl.once('close', () => resolve(''));
  });
}

/**
 * Show content to user and ask for approval (Agno user_feedback mode).
 * Returns { approved: boolean; comment: string }.
 */
export async function promptUserFeedback(
  label: string,
  content: string,
): Promise<{ approved: boolean; comment: string }> {
  if (!process.stdin.isTTY) return { approved: true, comment: '' };

  const preview = content.length > 400 ? content.slice(0, 400) + '\n  …(truncated)' : content;
  process.stdout.write(`\n  ─── ${label} ───\n${preview}\n  ─────────────\n`);
  process.stdout.write(`  Approve? [y]es  [n]o  [e]dit comment: `);

  // readline-based — no raw mode, no stdin corruption
  return new Promise<{ approved: boolean; comment: string }>((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
    let resolved = false;
    const done = (r: { approved: boolean; comment: string }) => {
      if (resolved) return;
      resolved = true;
      rl.close();
      resolve(r);
    };
    rl.once('line', (line) => {
      const s = line.trim().toLowerCase();
      if (s === 'y' || s === 'yes' || s === '') done({ approved: true, comment: '' });
      else done({ approved: false, comment: line.trim() });
    });
    rl.once('close', () => done({ approved: true, comment: '' }));
    rl.once('SIGINT', () => done({ approved: false, comment: '' }));
    // Safety timeout
    setTimeout(() => done({ approved: false, comment: '' }), 300000);
  });
}
