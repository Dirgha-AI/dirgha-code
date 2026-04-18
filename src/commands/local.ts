/**
 * commands/local.ts — /local slash command
 * Shows local AI (llama-server) status and model availability.
 */
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { C } from '../tui/colors.js';
import type { ReplContext } from '../types.js';

async function isLlamaRunning(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:8082/health', { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

interface ModelInfo {
  name: string;
  sizeMB: number;
}

function findLocalModels(): ModelInfo[] {
  const modelsDir = path.join(os.homedir(), 'models');
  try {
    const entries = fs.readdirSync(modelsDir);
    return entries
      .filter(f => f.endsWith('.gguf'))
      .map(f => {
        const filePath = path.join(modelsDir, f);
        let sizeMB = 0;
        try {
          const stat = fs.statSync(filePath);
          sizeMB = Math.round(stat.size / (1024 * 1024));
        } catch { /* ignore */ }
        return { name: f, sizeMB };
      });
  } catch {
    return [];
  }
}

export async function handleLocalCommand(ctx: ReplContext, _args: string): Promise<void> {
  const running = await isLlamaRunning();
  const models = findLocalModels();

  const brand = chalk.hex(C.brand);
  const muted = chalk.hex(C.textMuted);
  const primary = chalk.hex(C.textPrimary);
  const secondary = chalk.hex(C.textSecondary);

  ctx.print('');
  ctx.print(brand('  ◆ Local AI Status'));

  const serverDot = running
    ? chalk.green('●') + ' ' + chalk.green('running')
    : chalk.red('○') + ' ' + muted('stopped');
  ctx.print(`    llama-server:  ${serverDot}`);

  if (models.length === 0) {
    ctx.print(`    model:         ${muted('none')}`);
  } else {
    for (const m of models) {
      ctx.print(`    model:         ${primary(m.name)} ${muted(`(${m.sizeMB}MB)`)}`);
    }
  }

  ctx.print('');

  if (!running || models.length === 0) {
    ctx.print(secondary('  To enable local AI:'));
    ctx.print('');
    ctx.print(muted('  Option 1 — Gateway download endpoint:'));
    ctx.print(chalk.hex(C.accent)('    POST http://localhost:3001/api/inference/download'));
    ctx.print(muted('    Body: { "model": "gemma-3-1b-it-Q4_K_M" }'));
    ctx.print('');
    ctx.print(muted('  Option 2 — Manual download:'));
    ctx.print(chalk.dim('    python3 -c "from huggingface_hub import hf_hub_download; \\'));
    ctx.print(chalk.dim('      hf_hub_download(repo_id=\'bartowski/gemma-3-1b-it-GGUF\', \\'));
    ctx.print(chalk.dim('        filename=\'gemma-3-1b-it-Q4_K_M.gguf\', \\'));
    ctx.print(chalk.dim('        local_dir=\'~/models\')"'));
    ctx.print('');
  }
}
