/**
 * /mode — switch the REPL's execution mode. The mode is prepended to
 * the system prompt of every subsequent turn via the interactive loop,
 * which reads ctx.mode / ctx.setMode on each submit. Preference
 * persists to ~/.dirgha/config.json so new sessions honour it.
 */

import type { SlashCommand } from './types.js';
import { MODES, saveMode, modePreamble, type Mode } from '../../context/mode.js';

export const modeCommand: SlashCommand = {
  name: 'mode',
  description: 'Show or switch execution mode (plan|act|yolo|verify|ask)',
  async execute(args, ctx) {
    const current = ctx.getMode();
    if (args.length === 0) {
      return [
        `Current mode: ${current}`,
        `Available:    ${MODES.join(' · ')}`,
        '',
        modePreamble(current),
      ].join('\n');
    }
    const next = args[0] as Mode;
    if (!(MODES as readonly string[]).includes(next)) {
      return `Unknown mode "${next}". Choose one of: ${MODES.join(', ')}`;
    }
    await saveMode(next);
    ctx.setMode(next);
    const blurb = next === 'plan' ? '(Read-only — no writes or shells.)'
      : next === 'verify' ? '(Read-only audit — no modifications.)'
      : next === 'ask' ? '(Read-only Q&A — no mutating tools.)'
      : next === 'yolo' ? '(⚠ Every tool call is auto-approved. Destructive actions run without prompting.)'
      : '(Normal execution.)';
    return `Mode set to ${next}. ${blurb}`;
  },
};
