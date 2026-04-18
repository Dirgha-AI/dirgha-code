// SPDX-License-Identifier: BUSL-1.1
import { readdir, stat, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

async function dirSize(path: string): Promise<number> {
  const s = await stat(path);
  if (!s.isDirectory()) return s.size;
  const entries = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(entries.map(e => dirSize(join(path, e.name))));
  return sizes.reduce((a, b) => a + b, 0);
}

export async function pruneSessions(opts?: { maxSessions?: number; maxBytes?: number; dryRun?: boolean }): Promise<{ removed: string[]; freedBytes: number; kept: number }> {
  const maxSessions = opts?.maxSessions ?? 50;
  const maxBytes = opts?.maxBytes ?? 500 * 1024 * 1024;
  const dryRun = opts?.dryRun ?? false;
  const base = join(process.env.DIRGHA_HOME || homedir(), '.dirgha', 'sessions');
  
  const entries = await readdir(base).catch(() => [] as string[]);
  const dirs = await Promise.all(entries.map(async name => {
    const path = join(base, name);
    const s = await stat(path);
    return s.isDirectory() ? { name, path, mtime: s.mtime, size: await dirSize(path) } : null;
  }));
  
  const valid = dirs.filter((d): d is NonNullable<typeof d> => d !== null).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  let kept = 0, keptBytes = 0;
  const toRemove: typeof valid = [];
  
  for (const d of valid) {
    if (kept < maxSessions && keptBytes + d.size <= maxBytes) {
      kept++;
      keptBytes += d.size;
    } else {
      toRemove.push(d);
    }
  }
  
  let freedBytes = 0;
  const removed: string[] = [];
  for (const d of toRemove) {
    if (!dryRun) await rm(d.path, { recursive: true, force: true });
    removed.push(d.name);
    freedBytes += d.size;
  }
  
  return { removed, freedBytes, kept };
}
