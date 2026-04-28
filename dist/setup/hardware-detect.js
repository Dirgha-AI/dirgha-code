/**
 * Hardware probe — Node built-ins only. Returns a typed profile that
 * downstream model-recommendation code uses to filter the catalogue.
 * GPU detection is best-effort: nvidia-smi if present, null otherwise.
 */
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
function detectPlatform() {
    const p = process.platform;
    if (p === 'darwin')
        return 'mac';
    if (p === 'win32')
        return 'windows';
    return 'linux';
}
function detectGPU() {
    try {
        const out = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        const line = out.split('\n')[0];
        if (!line)
            return { name: null, vramGB: null };
        const parts = line.split(',');
        const name = parts[0]?.trim() ?? null;
        const vramMB = Number.parseInt(parts[1]?.trim() ?? '', 10);
        const vramGB = Number.isNaN(vramMB) ? null : Math.round((vramMB / 1024) * 10) / 10;
        return { name: name || null, vramGB };
    }
    catch {
        return { name: null, vramGB: null };
    }
}
function detectAVX2(platform) {
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
    }
    catch { /* fall through */ }
    return true;
}
export async function detectHardware() {
    const platform = detectPlatform();
    const cpuCores = os.cpus().length;
    const totalRamGB = Math.round((os.totalmem() / 1e9) * 10) / 10;
    const freeRamGB = Math.round((os.freemem() / 1e9) * 10) / 10;
    const { name: gpuName, vramGB } = detectGPU();
    const avx2 = detectAVX2(platform);
    return { cpuCores, totalRamGB, freeRamGB, gpuName, vramGB, avx2, platform };
}
export function summariseHardware(hw) {
    const gpu = hw.gpuName !== null
        ? `${hw.gpuName} · ${hw.vramGB ?? '?'} GB VRAM`
        : 'no NVIDIA GPU detected';
    return [
        `Platform:  ${hw.platform} · ${hw.cpuCores} cores · AVX2 ${hw.avx2 ? 'yes' : 'no'}`,
        `Memory:    ${hw.totalRamGB} GB total · ${hw.freeRamGB} GB free`,
        `GPU:       ${gpu}`,
    ];
}
//# sourceMappingURL=hardware-detect.js.map