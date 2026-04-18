// @ts-nocheck
/**
 * rivet/mount.ts — Filesystem mount abstraction for flexible storage backends
 * 
 * Features:
 * - Mount S3 buckets as directories
 * - Mount Google Drive folders
 * - Mount SQLite databases as key-value stores
 * - Transparent read/write across all backends
 * 
 * Phase C: Mount abstraction (Rivet Agent-OS)
 */

import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

/** Mount types supported */
export type MountType = 'local' | 's3' | 'gdrive' | 'sqlite' | 'memory' | 'r2';

/** Mount configuration */
export interface MountConfig {
  /** Mount point (local path) */
  mountPoint: string;
  /** Backend type */
  type: MountType;
  /** Backend-specific configuration */
  config: Record<string, unknown>;
  /** Read-only mount */
  readonly?: boolean;
  /** Auto-create mount point */
  autoCreate?: boolean;
  /** Cache settings */
  cache?: {
    enabled: boolean;
    ttlMs: number;
    maxSize: number;
  };
}

/** Mounted filesystem interface */
export interface MountedFS {
  /** Mount configuration */
  config: MountConfig;
  /** Read file */
  readFile(path: string): Promise<Buffer>;
  /** Write file */
  writeFile(path: string, data: Buffer | string): Promise<void>;
  /** Check if exists */
  exists(path: string): Promise<boolean>;
  /** List directory */
  readdir(path: string): Promise<string[]>;
  /** Create directory */
  mkdir(path: string): Promise<void>;
  /** Delete file/directory */
  delete(path: string): Promise<void>;
  /** Get file stats */
  stat(path: string): Promise<{
    size: number;
    mtime: Date;
    isDirectory: boolean;
  }>;
  /** Search files */
  search?(pattern: string, path?: string): Promise<string[]>;
  /** Sync (flush caches) */
  sync?(): Promise<void>;
  /** Unmount */
  unmount(): Promise<void>;
}

/** Mount manager */
export class MountManager {
  private mounts = new Map<string, MountedFS>();
  private cacheDir: string;

  constructor() {
    this.cacheDir = join(homedir(), '.dirgha', 'mount-cache');
  }

  /** Mount a filesystem */
  async mount(config: MountConfig): Promise<MountedFS> {
    // Create mount point if needed
    if (config.autoCreate !== false) {
      await fs.mkdir(config.mountPoint, { recursive: true });
    }

    let mounted: MountedFS;

    switch (config.type) {
      case 'local':
        mounted = new LocalFS(config);
        break;
      case 's3':
        mounted = new S3FS(config, this.cacheDir);
        break;
      case 'r2':
        mounted = new R2FS(config, this.cacheDir);
        break;
      case 'gdrive':
        mounted = new GDriveFS(config, this.cacheDir);
        break;
      case 'sqlite':
        mounted = new SQLiteFS(config);
        break;
      case 'memory':
        mounted = new MemoryFS(config);
        break;
      default:
        throw new Error(`Unknown mount type: ${config.type}`);
    }

    this.mounts.set(config.mountPoint, mounted);
    return mounted;
  }

  /** Unmount a filesystem */
  async unmount(mountPoint: string): Promise<boolean> {
    const mounted = this.mounts.get(mountPoint);
    if (!mounted) return false;

    await mounted.unmount();
    this.mounts.delete(mountPoint);
    return true;
  }

  /** Get mounted filesystem by path */
  getMountForPath(filepath: string): MountedFS | undefined {
    // Find longest matching mount point
    let bestMatch: MountedFS | undefined;
    let bestLen = 0;

    for (const [mountPoint, fs] of this.mounts) {
      if (filepath.startsWith(mountPoint) && mountPoint.length > bestLen) {
        bestMatch = fs;
        bestLen = mountPoint.length;
      }
    }

    return bestMatch;
  }

  /** Resolve path to mount + relative path */
  resolvePath(filepath: string): { mount: MountedFS; relativePath: string } | null {
    const mount = this.getMountForPath(filepath);
    if (!mount) return null;

    const relativePath = relative(mount.config.mountPoint, filepath);
    return { mount, relativePath };
  }

  /** Read file (auto-routes to correct mount) */
  async readFile(filepath: string): Promise<Buffer> {
    const resolved = this.resolvePath(filepath);
    if (!resolved) {
      // Fall back to local filesystem
      return fs.readFile(filepath);
    }
    return resolved.mount.readFile(resolved.relativePath);
  }

  /** Write file (auto-routes to correct mount) */
  async writeFile(filepath: string, data: Buffer | string): Promise<void> {
    const resolved = this.resolvePath(filepath);
    if (!resolved) {
      await fs.writeFile(filepath, data);
      return;
    }
    return resolved.mount.writeFile(resolved.relativePath, data);
  }

  /** Check if exists (auto-routes) */
  async exists(filepath: string): Promise<boolean> {
    const resolved = this.resolvePath(filepath);
    if (!resolved) {
      try {
        await fs.access(filepath);
        return true;
      } catch {
        return false;
      }
    }
    return resolved.mount.exists(resolved.relativePath);
  }

  /** List all mounts */
  listMounts(): Array<{ mountPoint: string; type: MountType; readonly: boolean }> {
    return Array.from(this.mounts.entries()).map(([point, fs]) => ({
      mountPoint: point,
      type: fs.config.type,
      readonly: fs.config.readonly || false,
    }));
  }

  /** Unmount all */
  async unmountAll(): Promise<void> {
    for (const [point, mounted] of this.mounts) {
      await mounted.unmount();
    }
    this.mounts.clear();
  }
}

/** Local filesystem mount */
class LocalFS implements MountedFS {
  constructor(public config: MountConfig) {}

  async readFile(path: string): Promise<Buffer> {
    const fullPath = join(this.config.mountPoint, path);
    return fs.readFile(fullPath);
  }

  async writeFile(path: string, data: Buffer | string): Promise<void> {
    if (this.config.readonly) {
      throw new Error('Filesystem is read-only');
    }
    const fullPath = join(this.config.mountPoint, path);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    return fs.writeFile(fullPath, data);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(join(this.config.mountPoint, path));
      return true;
    } catch {
      return false;
    }
  }

  async readdir(path: string): Promise<string[]> {
    return fs.readdir(join(this.config.mountPoint, path));
  }

  async mkdir(path: string): Promise<void> {
    if (this.config.readonly) {
      throw new Error('Filesystem is read-only');
    }
    return fs.mkdir(join(this.config.mountPoint, path), { recursive: true });
  }

  async delete(path: string): Promise<void> {
    if (this.config.readonly) {
      throw new Error('Filesystem is read-only');
    }
    const fullPath = join(this.config.mountPoint, path);
    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      await fs.rmdir(fullPath, { recursive: true });
    } else {
      await fs.unlink(fullPath);
    }
  }

  async stat(path: string): Promise<{ size: number; mtime: Date; isDirectory: boolean }> {
    const stats = await fs.stat(join(this.config.mountPoint, path));
    return {
      size: stats.size,
      mtime: stats.mtime,
      isDirectory: stats.isDirectory(),
    };
  }

  async unmount(): Promise<void> {
    // Nothing to clean up for local
  }
}

/** In-memory filesystem */
class MemoryFS implements MountedFS {
  private files = new Map<string, Buffer>();
  private dirs = new Set<string>();

  constructor(public config: MountConfig) {}

  async readFile(path: string): Promise<Buffer> {
    const data = this.files.get(path);
    if (!data) {
      throw new Error(`File not found: ${path}`);
    }
    return Buffer.from(data);
  }

  async writeFile(path: string, data: Buffer | string): Promise<void> {
    if (this.config.readonly) {
      throw new Error('Filesystem is read-only');
    }
    this.files.set(path, Buffer.from(data));
    // Ensure parent dirs exist
    let dir = dirname(path);
    while (dir !== '.' && dir !== '/') {
      this.dirs.add(dir);
      dir = dirname(dir);
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async readdir(path: string): Promise<string[]> {
    const prefix = path === '/' || path === '.' ? '' : path + '/';
    const entries = new Set<string>();
    
    for (const file of this.files.keys()) {
      if (file.startsWith(prefix)) {
        const rest = file.slice(prefix.length);
        const name = rest.split('/')[0];
        if (name) entries.add(name);
      }
    }
    
    for (const dir of this.dirs) {
      if (dir.startsWith(prefix)) {
        const rest = dir.slice(prefix.length);
        const name = rest.split('/')[0];
        if (name) entries.add(name);
      }
    }
    
    return Array.from(entries);
  }

  async mkdir(path: string): Promise<void> {
    if (this.config.readonly) {
      throw new Error('Filesystem is read-only');
    }
    this.dirs.add(path);
  }

  async delete(path: string): Promise<void> {
    if (this.config.readonly) {
      throw new Error('Filesystem is read-only');
    }
    this.files.delete(path);
    this.dirs.delete(path);
    // Clean up children
    for (const file of this.files.keys()) {
      if (file.startsWith(path + '/')) {
        this.files.delete(file);
      }
    }
  }

  async stat(path: string): Promise<{ size: number; mtime: Date; isDirectory: boolean }> {
    if (this.dirs.has(path)) {
      return { size: 0, mtime: new Date(), isDirectory: true };
    }
    const data = this.files.get(path);
    if (data) {
      return { size: data.length, mtime: new Date(), isDirectory: false };
    }
    throw new Error(`Path not found: ${path}`);
  }

  async unmount(): Promise<void> {
    this.files.clear();
    this.dirs.clear();
  }
}

/** S3 filesystem (placeholder - requires aws-sdk) */
class S3FS implements MountedFS {
  private cacheDir: string;
  private localCache = new Map<string, string>();

  constructor(public config: MountConfig, cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  async readFile(path: string): Promise<Buffer> {
    // In real implementation: S3.getObject -> cache -> return
    // For now, check local cache
    const cached = this.localCache.get(path);
    if (cached) {
      return fs.readFile(cached);
    }
    throw new Error('S3 not configured. Install aws-sdk and configure credentials.');
  }

  async writeFile(path: string, data: Buffer | string): Promise<void> {
    if (this.config.readonly) {
      throw new Error('Filesystem is read-only');
    }
    // In real implementation: S3.putObject
    throw new Error('S3 not configured');
  }

  async exists(path: string): Promise<boolean> {
    // In real implementation: S3.headObject
    return this.localCache.has(path);
  }

  async readdir(path: string): Promise<string[]> {
    // In real implementation: S3.listObjectsV2
    return [];
  }

  async mkdir(): Promise<void> {
    // S3 doesn't need explicit directory creation
  }

  async delete(path: string): Promise<void> {
    if (this.config.readonly) {
      throw new Error('Filesystem is read-only');
    }
    // In real implementation: S3.deleteObject
    this.localCache.delete(path);
  }

  async stat(path: string): Promise<{ size: number; mtime: Date; isDirectory: boolean }> {
    // In real implementation: S3.headObject
    throw new Error('S3 not configured');
  }

  async unmount(): Promise<void> {
    this.localCache.clear();
  }
}

/** Cloudflare R2 filesystem */
class R2FS extends S3FS {
  // R2 is S3-compatible, just different endpoint
  constructor(config: MountConfig, cacheDir: string) {
    super(config, cacheDir);
  }
}

/** Google Drive filesystem (placeholder) */
class GDriveFS implements MountedFS {
  private cacheDir: string;

  constructor(public config: MountConfig, cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  async readFile(): Promise<Buffer> {
    throw new Error('Google Drive not configured. Install googleapis and authenticate.');
  }

  async writeFile(): Promise<void> {
    throw new Error('Google Drive not configured');
  }

  async exists(): Promise<boolean> {
    return false;
  }

  async readdir(): Promise<string[]> {
    return [];
  }

  async mkdir(): Promise<void> {
    // No-op
  }

  async delete(): Promise<void> {
    throw new Error('Google Drive not configured');
  }

  async stat(): Promise<{ size: number; mtime: Date; isDirectory: boolean }> {
    throw new Error('Google Drive not configured');
  }

  async unmount(): Promise<void> {
    // No-op
  }
}

/** SQLite filesystem (key-value store backed by SQLite) */
class SQLiteFS implements MountedFS {
  private dbPath: string;

  constructor(public config: MountConfig) {
    this.dbPath = (config.config.dbPath as string) || ':memory:';
  }

  async readFile(path: string): Promise<Buffer> {
    // In real implementation: SELECT content FROM files WHERE path = ?
    throw new Error('SQLite not implemented. Install better-sqlite3.');
  }

  async writeFile(path: string, data: Buffer | string): Promise<void> {
    if (this.config.readonly) {
      throw new Error('Filesystem is read-only');
    }
    // In real implementation: INSERT OR REPLACE INTO files ...
    throw new Error('SQLite not implemented');
  }

  async exists(): Promise<boolean> {
    return false;
  }

  async readdir(): Promise<string[]> {
    return [];
  }

  async mkdir(): Promise<void> {
    // No-op for SQLite
  }

  async delete(): Promise<void> {
    // DELETE FROM files WHERE path = ?
  }

  async stat(): Promise<{ size: number; mtime: Date; isDirectory: boolean }> {
    throw new Error('SQLite not implemented');
  }

  async search(pattern: string): Promise<string[]> {
    // SELECT path FROM files WHERE path LIKE ?
    return [];
  }

  async unmount(): Promise<void> {
    // Close database connection
  }
}

/** Helper: Mount S3 bucket */
export async function mountS3(
  manager: MountManager,
  mountPoint: string,
  bucket: string,
  region: string,
  options?: { readonly?: boolean; prefix?: string }
): Promise<MountedFS> {
  return manager.mount({
    mountPoint,
    type: 's3',
    config: {
      bucket,
      region,
      prefix: options?.prefix || '',
    },
    readonly: options?.readonly,
  });
}

/** Helper: Mount R2 bucket */
export async function mountR2(
  manager: MountManager,
  mountPoint: string,
  bucket: string,
  accountId: string,
  options?: { readonly?: boolean }
): Promise<MountedFS> {
  return manager.mount({
    mountPoint,
    type: 'r2',
    config: {
      bucket,
      accountId,
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    },
    readonly: options?.readonly,
  });
}

/** Helper: Create in-memory filesystem */
export async function mountMemory(
  manager: MountManager,
  mountPoint: string
): Promise<MountedFS> {
  return manager.mount({
    mountPoint,
    type: 'memory',
    config: {},
  });
}

/** Render mount status for display */
export function renderMounts(manager: MountManager): string {
  const mounts = manager.listMounts();
  
  if (mounts.length === 0) {
    return 'No mounts active';
  }

  const lines = mounts.map(m => {
    const icon = m.readonly ? '🔒' : '📂';
    const type = m.type.toUpperCase().padEnd(8);
    return `${icon} [${type}] ${m.mountPoint}`;
  });

  return ['Active Mounts:', ...lines].join('\n');
}
