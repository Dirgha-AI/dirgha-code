/**
 * injector.ts — Prompt injection scanner + overlay applicator
 *
 * Blocks context file loading if suspicious patterns are found.
 * Called before loading DIRGHA.md / AGENTS.md / CLAUDE.md into system prompt.
 *
 * Also provides PromptOverlay: two modes for composing system prompts:
 *   - 'append'  — for additive context (wiki index, strategy docs, project notes)
 *   - 'replace' — for persona loading (Janus Koncepts, custom agent identities)
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /disregard\s+(all\s+)?previous/i,
  /system\s*prompt.*override/i,
  /\u200b|\u200c|\u200d|\u200e|\u200f|\ufeff/, // invisible Unicode
  /curl\s+.*-d\s+.*ANTHROPIC_API_KEY/i,
  /curl\s+.*@~\/\.env/i,
  /fetch\(.*credentials/i,
  // Base64 exfil pattern (base64 string > 50 chars)
  /[A-Za-z0-9+/]{50,}={0,2}/,
];

export interface ScanResult {
  safe: boolean;
  reason?: string;
}

export function scanContent(content: string, source: string): ScanResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return {
        safe: false,
        reason: `Injection pattern detected in ${source}: ${pattern.toString().slice(0, 40)}`,
      };
    }
  }
  return { safe: true };
}

// ---------------------------------------------------------------------------
// Prompt Overlay — append vs replace modes
// Source pattern: kommander/oc-plugin-vault-tec
// ---------------------------------------------------------------------------

export interface PromptOverlay {
  content: string;
  /** 'append': add after base prompt (wiki, strategy, project context).
   *  'replace': swap base prompt entirely (persona loading, e.g. Janus Koncepts). */
  mode: 'append' | 'replace';
  /** Higher priority overlays applied last when stacking multiple appends. */
  priority?: number;
}

/**
 * Apply a single overlay to a base system prompt.
 * - replace: returns overlay.content verbatim (persona takes full control)
 * - append:  concatenates with a blank line separator
 */
export function applyOverlay(basePrompt: string, overlay: PromptOverlay): string {
  if (overlay.mode === 'replace') return overlay.content;
  return `${basePrompt}\n\n${overlay.content}`;
}

/**
 * Apply multiple overlays in priority order (ascending — higher number applied last).
 * Replace-mode overlays short-circuit: the highest-priority replace wins and no
 * further appends are processed (persona overrides everything below it).
 */
export function applyOverlays(basePrompt: string, overlays: PromptOverlay[]): string {
  const sorted = [...overlays].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  // If any overlay is replace-mode, find the highest-priority one and return it
  const replaceOverlay = sorted.filter(o => o.mode === 'replace').at(-1);
  if (replaceOverlay) return replaceOverlay.content;
  // Otherwise apply all appends in order
  return sorted.reduce((prompt, overlay) => applyOverlay(prompt, overlay), basePrompt);
}
