/**
 * tui/startup-cta.ts — Startup call-to-action banner.
 *
 * State machine:
 *   - First 3 launches  → Option B (invitational, explains the 3 on-ramps)
 *   - Subsequent        → Option A (minimal status line)
 *
 * Run count persists at ~/.dirgha/state.json { launchCount: number }.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isLoggedIn, readCredentials } from '../utils/credentials.js';

const STATE_PATH = path.join(os.homedir(), '.dirgha', 'state.json');
const INVITATIONAL_RUNS = 3;

/** Read the full state.json (other keys preserved). */
function readState(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const j = JSON.parse(raw);
    return (j && typeof j === 'object') ? j : {};
  } catch { return {}; }
}

/** Bump launchCount in place; preserves all other state.json keys. */
function bumpLaunchCount(): number {
  const st = readState();
  const next = (typeof st.launchCount === 'number' ? st.launchCount : 0) + 1;
  st.launchCount = next;
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(st, null, 2));
  } catch { /* best effort */ }
  return next;
}

type AuthState = 'first-run' | 'byok-only' | 'signed-in' | 'signed-in-byok';

function detectAuthState(): AuthState {
  const logged = isLoggedIn();
  const byokVars = [
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
    'FIREWORKS_API_KEY', 'NVIDIA_API_KEY', 'GROQ_API_KEY',
    'GEMINI_API_KEY', 'MISTRAL_API_KEY', 'XAI_API_KEY', 'COHERE_API_KEY',
    'DEEPINFRA_API_KEY', 'PERPLEXITY_API_KEY', 'TOGETHER_API_KEY',
  ];
  const byokCount = byokVars.filter(k => !!process.env[k]).length;
  if (logged && byokCount > 0) return 'signed-in-byok';
  if (logged) return 'signed-in';
  if (byokCount > 0) return 'byok-only';
  return 'first-run';
}

function countByokProviders(): number {
  const vars = [
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
    'FIREWORKS_API_KEY', 'NVIDIA_API_KEY', 'GROQ_API_KEY',
    'GEMINI_API_KEY', 'MISTRAL_API_KEY', 'XAI_API_KEY', 'COHERE_API_KEY',
    'DEEPINFRA_API_KEY', 'PERPLEXITY_API_KEY', 'TOGETHER_API_KEY',
  ];
  return vars.filter(k => !!process.env[k]).length;
}

export interface StartupCtaLines {
  /** Lines to push into the chat history as system messages (dim). */
  lines: string[];
  /** Whether this is the expanded invitational variant. */
  invitational: boolean;
  /** The auth state we detected (for caller use). */
  state: AuthState;
}

/**
 * Compose startup CTA. Call once at TUI mount; caller pushes each line
 * as a system message to the chat log.
 */
export function buildStartupCta(opts: { model?: string; fleetActive?: number } = {}): StartupCtaLines {
  const count = bumpLaunchCount();
  const state = detectAuthState();
  const invitational = count <= INVITATIONAL_RUNS && state === 'first-run';

  if (invitational) {
    return {
      invitational: true,
      state,
      lines: [
        '  Get started in 10 seconds:',
        '    /signup    create a Dirgha account',
        '    /login     already have an account',
        '    /keys      bring your own provider key · 14 supported',
        '',
        '  Docs: dirgha.ai/code · github.com/dirghaai/dirgha-code',
      ],
    };
  }

  // Compact status line for returning users
  const modelLabel = opts.model ? opts.model.split('/').slice(-1)[0] : '(none)';
  const fleet = opts.fleetActive && opts.fleetActive > 0
    ? `Fleet × ${opts.fleetActive} active · /fleet`
    : null;

  const lines: string[] = [];
  switch (state) {
    case 'first-run': {
      lines.push('  ⊘ Not configured · /signup · /login · /keys');
      lines.push('  Plan: (none) · dirgha.ai/code');
      break;
    }
    case 'byok-only': {
      const n = countByokProviders();
      lines.push(`  BYOK · ${n} provider${n > 1 ? 's' : ''} · /keys`);
      lines.push(`  Model: ${modelLabel} · /model`);
      break;
    }
    case 'signed-in': {
      const creds = readCredentials();
      lines.push(`  Signed in · ${creds?.email ?? 'unknown'} · /account`);
      lines.push(`  Model: ${modelLabel} · /model · /upgrade`);
      break;
    }
    case 'signed-in-byok': {
      const creds = readCredentials();
      const n = countByokProviders();
      lines.push(`  Signed in · ${creds?.email ?? 'unknown'} · /account`);
      lines.push(`  BYOK + Gateway · ${n} key${n > 1 ? 's' : ''} · ${modelLabel} · /model`);
      break;
    }
  }
  if (fleet) lines.push(`  ${fleet}`);
  return { invitational: false, state, lines };
}
