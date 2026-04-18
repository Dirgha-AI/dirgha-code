/**
 * commands/setup-local.ts — /setup local interactive wizard.
 * Detects hardware, recommends models, and triggers gateway download.
 */
import chalk from 'chalk';
import readline from 'readline';
import { C } from '../tui/colors.js';
import type { ReplContext } from '../types.js';
import { detectHardware } from '../setup/hardwareDetect.js';
import { recommendModels, isModelDownloaded } from '../setup/modelCurator.js';
import type { LocalModel } from '../setup/modelCurator.js';

async function isLlamaRunning(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:8082/health', {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function formatSize(sizeGB: number): string {
  if (sizeGB < 1) return `${Math.round(sizeGB * 1000)} MB`;
  return `${sizeGB} GB`;
}

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

async function askQuestion(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, ans => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function triggerGatewayDownload(hfFile: string): void {
  const adminToken = process.env['ADMIN_TOKEN'] ?? '';
  fetch('http://localhost:3001/api/inference/download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken,
    },
    body: JSON.stringify({ model: hfFile }),
  }).catch(() => { /* fire-and-forget */ });
}

export async function handleSetupLocalCommand(ctx: ReplContext): Promise<void> {
  const brand = chalk.hex(C.brand);
  const accent = chalk.hex(C.accent);
  const primary = chalk.hex(C.textPrimary);
  const secondary = chalk.hex(C.textSecondary);
  const muted = chalk.hex(C.textMuted);
  const dim = chalk.dim;

  ctx.print('');
  ctx.print(brand('  ◆ Detecting hardware...'));

  const hw = await detectHardware();

  ctx.print('');
  const avxMark = hw.avx2 ? chalk.green('✓') : chalk.red('✗');
  ctx.print(primary(`  CPU:   ${hw.cpuCores} cores  (AVX2 ${avxMark})`));
  ctx.print(primary(`  RAM:   ${hw.totalRamGB} GB`));
  if (hw.gpuName) {
    ctx.print(primary(`  GPU:   ${hw.gpuName}`) + muted(` (${hw.vramGB ?? '?'} GB VRAM)`));
  } else {
    ctx.print(muted('  GPU:   none detected'));
  }
  ctx.print('');

  const recs = recommendModels(hw);

  if (recs.length === 0) {
    ctx.print(muted('  No models fit within available RAM. Minimum 2GB required.'));
    ctx.print('');
    return;
  }

  ctx.print(secondary('  Recommended models for your hardware:'));
  ctx.print('');

  const downloaded: boolean[] = recs.map(m => isModelDownloaded(m));

  recs.forEach((m: LocalModel, i: number) => {
    const num = chalk.hex(C.accent)(`  ${i + 1}`);
    const name = pad(m.name, 14);
    const size = pad(formatSize(m.sizeGB), 8);
    const desc = m.description;
    const badge = downloaded[i] ? chalk.green('  already downloaded ✓') : '';
    const rec = i === 0 ? dim('  [recommended]') : '';
    ctx.print(`${num}  ${primary(name)} ${muted(size)} ${dim(desc)}${badge}${rec}`);
  });

  ctx.print('');

  // If top recommendation is already downloaded and llama-server is running — done
  const topDownloaded = downloaded[0] === true;
  if (topDownloaded && await isLlamaRunning()) {
    ctx.print(brand('  ◆ Already set up! Run /local to check status.'));
    ctx.print('');
    return;
  }

  const choices = recs.map((_, i) => String(i + 1)).join('/');
  const answer = await askQuestion(
    chalk.hex(C.brand)(`  Download which model? [${choices}/skip] > `)
  );

  ctx.print('');

  if (answer === '' || answer.toLowerCase() === 'skip' || answer.toLowerCase() === 's') {
    ctx.print(dim('  ◆ Skipped. Run /setup local anytime to set up offline AI.'));
    ctx.print('');
    return;
  }

  const idx = parseInt(answer, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= recs.length) {
    ctx.print(chalk.hex(C.error ?? '#EF4444')('  Invalid choice.'));
    ctx.print('');
    return;
  }

  const chosen = recs[idx]!;
  ctx.print(brand(`  ◆ Downloading ${chosen.name} (${formatSize(chosen.sizeGB)})...`));

  // Check if gateway is reachable before fire-and-forget
  let gatewayUp = false;
  try {
    const probe = await fetch('http://localhost:3001/health', {
      signal: AbortSignal.timeout(2000),
    });
    gatewayUp = probe.ok;
  } catch {
    gatewayUp = false;
  }

  if (gatewayUp) {
    triggerGatewayDownload(chosen.hfFile);
    ctx.print(dim('  ◆ Download started in background. Run /local to track progress.'));
  } else {
    ctx.print(muted('  Gateway not running. Download manually:'));
    ctx.print('');
    ctx.print(accent('  python3 -c "from huggingface_hub import hf_hub_download; \\'));
    ctx.print(accent(`    hf_hub_download(repo_id='${chosen.hfRepo}', \\`));
    ctx.print(accent(`      filename='${chosen.hfFile}', \\`));
    ctx.print(accent("      local_dir='/root/models')\""));
  }

  ctx.print('');
}
