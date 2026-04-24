/**
 * /status — compact summary of the current REPL session: session id,
 * model, cumulative token usage, and a quick project-profile readout
 * pulled from DIRGHA.md if present.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SlashCommand } from './types.js';

async function dirghaSummary(cwd: string): Promise<string | undefined> {
  const path = join(cwd, 'DIRGHA.md');
  const info = await stat(path).catch(() => undefined);
  if (!info) return undefined;
  const text = await readFile(path, 'utf8').catch(() => '');
  const firstPara = text.split(/\n\s*\n/, 2)[1] ?? text.split('\n', 3).slice(1).join(' ');
  return firstPara.trim().slice(0, 240);
}

export const statusCommand: SlashCommand = {
  name: 'status',
  description: 'Session summary: model, token usage, project profile',
  async execute(_args, ctx) {
    const lines = [
      'Session status',
      `  session id : ${ctx.sessionId}`,
      `  model      : ${ctx.model}`,
      `  usage      : ${ctx.showCost()}`,
    ];
    const summary = await dirghaSummary(process.cwd());
    if (summary) {
      lines.push('', 'DIRGHA.md:', '  ' + summary.replace(/\n/g, '\n  '));
    } else {
      lines.push('', 'DIRGHA.md: not found (run /init to create one)');
    }
    return lines.join('\n');
  },
};
