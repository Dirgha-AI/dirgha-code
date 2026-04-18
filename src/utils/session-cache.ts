/**
 * utils/session-cache.ts — In-memory LRU session cache for file reads
 * Pattern from mintlify ChromaFs: cache directory tree and file content
 * in memory to avoid redundant filesystem calls within a session.
 */
import { createHash } from 'node:crypto';
import { statSync, readdirSync } from 'node:fs';
import path from 'node:path';

interface CacheEntry<T> {
  value: T;
  hits: number;
  insertedAt: number;
}

/** Simple LRU-ish Map with max size and TTL */
export class LRUCache<T> {
  private map = new Map<string, CacheEntry<T>>();

  constructor(
    private maxSize = 256,
    private ttlMs = 60_000,
  ) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.insertedAt > this.ttlMs) { this.map.delete(key); return undefined; }
    entry.hits++;
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.map.size >= this.maxSize) {
      // Evict LFU (fewest hits)
      let minHits = Infinity, minKey = '';
      for (const [k, e] of this.map) { if (e.hits < minHits) { minHits = e.hits; minKey = k; } }
      if (minKey) this.map.delete(minKey);
    }
    this.map.set(key, { value, hits: 1, insertedAt: Date.now() });
  }

  invalidate(key: string): void { this.map.delete(key); }
  invalidateByPrefix(prefix: string): void {
    for (const k of this.map.keys()) { if (k.startsWith(prefix)) this.map.delete(k); }
  }
  clear(): void { this.map.clear(); }
  get size(): number { return this.map.size; }
}

// ─── Session-level singletons ────────────────────────────────────────────────

/** File content cache: key = `${path}:${mtime}` to auto-invalidate on write */
const fileCache = new LRUCache<string>(256, 120_000);

/** Directory tree cache: key = dirPath */
const dirCache = new LRUCache<string[]>(128, 30_000);

export function getCachedFile(filePath: string): string | undefined {
  const abs = path.resolve(filePath);
  try {
    const mtime = statSync(abs).mtimeMs;
    return fileCache.get(`${abs}:${mtime}`);
  } catch { return undefined; }
}

export function setCachedFile(filePath: string, content: string): void {
  const abs = path.resolve(filePath);
  try {
    const mtime = statSync(abs).mtimeMs;
    fileCache.set(`${abs}:${mtime}`, content);
  } catch { /* best-effort */ }
}

/** Invalidate file cache after a write (pass the path) */
export function invalidateFileCache(filePath: string): void {
  const abs = path.resolve(filePath);
  fileCache.invalidateByPrefix(abs + ':');
}

export function getCachedDir(dirPath: string): string[] | undefined {
  return dirCache.get(path.resolve(dirPath));
}

export function setCachedDir(dirPath: string, entries: string[]): void {
  dirCache.set(path.resolve(dirPath), entries);
}

export function invalidateDirCache(dirPath: string): void {
  dirCache.invalidate(path.resolve(dirPath));
}

// ---------------------------------------------------------------------------
// Session delta tracking — which files were written/edited this session
// ---------------------------------------------------------------------------

const _sessionWrites = new Set<string>();

export function recordWrite(filePath: string): void {
  _sessionWrites.add(filePath);
}

export function getSessionChanges(): string[] {
  return Array.from(_sessionWrites);
}

export function getSessionChangeSummary(): string {
  const files = getSessionChanges();
  if (files.length === 0) return 'No files modified this session.';
  const label = files.length === 1 ? '1 file' : `${files.length} files`;
  return `${label} modified:\n${files.map(f => `  • ${f}`).join('\n')}`;
}

export function clearSessionChanges(): void {
  _sessionWrites.clear();
}

export function clearSessionCache(): void {
  fileCache.clear();
  dirCache.clear();
}

export function getSessionCacheStats(): { files: number; dirs: number } {
  return { files: fileCache.size, dirs: dirCache.size };
}
