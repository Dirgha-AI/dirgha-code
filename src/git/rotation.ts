// SPDX-License-Identifier: BUSL-1.1
import { readdir, stat, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export async function rotateSnapshots(opts?: { maxBytes?: number; dryRun?: boolean }): Promise<{ rotated: string[]; freedBytes: number; keptBytes: number }> {
  const maxBytes = opts?.maxBytes ?? 200 * 1024 * 1024;
  const dryRun = opts?.dryRun ?? false;
  const base = join(process.env.DIRGHA_HOME || homedir(), '.dirgha', 'snapshots');
  
  const entries = await readdir(base).catch(() => [] as string[]);
  const packs = await Promise.all(
    entries.filter(f => f.endsWith('.pack')).map(async name => {
      const path = join(base, name);
      const idxPath = join(base, name.replace('.pack', '.idx'));
      const s = await stat(path);
      const idxStat = await stat(idxPath).catch(() => null);
      return { name, path, idxPath, mtime: s.mtime, size: s.size + (idxStat?.size ?? 0) };
    })
  );
  
  const sorted = packs.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
  let total = sorted.reduce((sum, p) => sum + p.size, 0);
  const rotated: string[] = [];
  let freedBytes = 0;
  
  for (const p of sorted) {
    if (total <= maxBytes) break;
    if (p === sorted[sorted.length - 1]) break;
    if (!dryRun) {
      await rm(p.path, { force: true });
      await rm(p.idxPath, { force: true }).catch(() => {});
    }
    rotated.push(p.name);
    freedBytes += p.size;
    total -= p.size;
  }
  
  return { rotated, freedBytes, keptBytes: total };
}
