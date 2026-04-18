/**
 * setup/hardwareDetect.ts — Hardware detection using only Node.js built-ins.
 * No external npm packages — uses os, fs, child_process only.
 */
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';

export interface HardwareProfile {
  cpuCores: number;
  totalRamGB: number;
  freeRamGB: number;
  gpuName: string | null;
  vramGB: number | null;
  avx2: boolean;
  platform: 'linux' | 'mac' | 'windows';
}

function detectPlatform(): 'linux' | 'mac' | 'windows' {
  const p = process.platform;
  if (p === 'darwin') return 'mac';
  if (p === 'win32') return 'windows';
  return 'linux';
}

function detectGPU(): { name: string | null; vramGB: number | null } {
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
      { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    const line = out.split('\n')[0];
    if (!line) return { name: null, vramGB: null };
    const parts = line.split(',');
    const name = parts[0]?.trim() ?? null;
    const vramMB = parseInt(parts[1]?.trim() ?? '', 10);
    const vramGB = isNaN(vramMB) ? null : Math.round((vramMB / 1024) * 10) / 10;
    return { name: name || null, vramGB };
  } catch {
    return { name: null, vramGB: null };
  }
}

function detectAVX2(platform: 'linux' | 'mac' | 'windows'): boolean {
  try {
    if (platform === 'linux') {
      const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
      return cpuinfo.includes('avx2');
    }
    if (platform === 'mac') {
      const out = execSync('sysctl -n hw.optional.avx2_0', {
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString().trim();
      return out === '1';
    }
  } catch {
    // fall through to default
  }
  // Default true — llama-server will detect at runtime
  return true;
}

export async function detectHardware(): Promise<HardwareProfile> {
  const platform = detectPlatform();
  const cpuCores = os.cpus().length;
  const totalRamGB = Math.round((os.totalmem() / 1e9) * 10) / 10;
  const freeRamGB = Math.round((os.freemem() / 1e9) * 10) / 10;
  const { name: gpuName, vramGB } = detectGPU();
  const avx2 = detectAVX2(platform);

  return { cpuCores, totalRamGB, freeRamGB, gpuName, vramGB, avx2, platform };
}
