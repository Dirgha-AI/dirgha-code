/**
 * join-mesh.ts - CLI command to join Bucky mesh as compute node (97 lines)
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import os from 'os';

interface HardwareCapabilities {
  cpuCores: number;
  ramGB: number;
  gpuVRAM?: number;
  avx2: boolean;
  tier: 'cpu' | 'mid-gpu' | 'high-gpu';
}

function detectHardware(): HardwareCapabilities {
  const cpuCores = os.cpus().length;
  const ramGB = Math.round(os.totalmem() / 1024 ** 3);
  let avx2 = false;
  let gpuVRAM: number | undefined;
  try {
    if (process.platform === 'linux') avx2 = execSync('cat /proc/cpuinfo', { encoding: 'utf8' }).includes('avx2');
  } catch { /* ignore */ }
  try {
    const smi = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader', { encoding: 'utf8' });
    gpuVRAM = Math.round(parseInt(smi.trim()) / 1024);
  } catch { /* no GPU */ }
  const tier: HardwareCapabilities['tier'] = gpuVRAM && gpuVRAM >= 16 ? 'high-gpu' : gpuVRAM ? 'mid-gpu' : 'cpu';
  return { cpuCores, ramGB, gpuVRAM, avx2, tier };
}

function formatHardware(caps: HardwareCapabilities): string {
  const parts = [
    `${caps.cpuCores} cores`,
    `${caps.ramGB}GB RAM`,
    caps.gpuVRAM ? `${caps.gpuVRAM}GB VRAM` : null,
    caps.avx2 ? 'AVX2' : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function registerJoinMeshCommand(program: Command): void {
  program
    .command('join-mesh')
    .description('Join Bucky compute mesh as a worker node')
    .option('-p, --port <port>', 'Listen port', '3002')
    .option('-n, --node-id <id>', 'Node ID (auto-generated if not set)')
    .action(async (options) => {
      const caps = detectHardware();
      const nodeId = options.nodeId || `cli-node-${Math.random().toString(36).slice(2, 8)}`;

      console.log(chalk.cyan('◆'), 'Joined mesh as', chalk.bold(nodeId), chalk.gray(`(${caps.tier})`));
      console.log();
      console.log(chalk.dim('Hardware Summary:'));
      console.log('  CPU:', chalk.white(caps.cpuCores + ' cores'), caps.avx2 ? chalk.green('(AVX2)') : '');
      console.log('  RAM:', chalk.white(caps.ramGB + ' GB'));
      if (caps.gpuVRAM) {
        console.log('  GPU:', chalk.white(caps.gpuVRAM + ' GB VRAM'), 
          caps.tier === 'high-gpu' ? chalk.green('(high-end)') : chalk.yellow('(mid-tier)'));
      } else {
        console.log('  GPU:', chalk.dim('none (CPU-only node)'));
      }
      console.log('  Tier:', chalk.bold(caps.tier));
      console.log();

      const env = {
        ...process.env,
        BUCKY_NODE_ID: nodeId,
        BUCKY_PORT: options.port,
      };

      const daemonPath = new URL('../../../../apps/bucky/dist/daemon/index.js', import.meta.url).pathname;

      console.log(chalk.dim('Starting daemon in background...'));
      console.log(chalk.dim('Port:'), options.port);
      console.log(chalk.dim('Logs:'), chalk.gray('pm2 logs dirgha-bucky'));
      console.log();
      console.log(chalk.green('✓'), 'Node is now accepting compute tasks from the mesh');
      console.log(chalk.dim('Press Ctrl+C to detach. The daemon continues running.'));
      console.log();

      // If PM2 is available, use it; otherwise spawn directly
      const usePM2 = process.env.USE_PM2 !== 'false';

      if (usePM2) {
        // Start via PM2 ecosystem
        const pm2Spawn = spawn('pm2', ['start', 'ecosystem.config.cjs', '--only', 'dirgha-bucky'], {
          cwd: '/root/dirgha-ai',
          env,
          detached: true,
          stdio: 'ignore',
        });
        pm2Spawn.unref();
        console.log(chalk.dim('Started via PM2. Check status with:'), chalk.cyan('pm2 status'));
      } else {
        // Direct spawn for development
        const child = spawn('node', [daemonPath], {
          env,
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        console.log(chalk.dim('PID:'), chalk.gray(child.pid?.toString()));
      }

      // Exit CLI after spawning
      setTimeout(() => process.exit(0), 500);
    });
}
