/**
 * models/manager.ts - Model download and management
 * Handles one-time downloads with resume support
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import type { ModelInfo, DownloadProgress } from './types.js';
import { ALL_MODELS, getModelById } from './registry.js';

const DEFAULT_STORAGE_PATH = join(homedir(), '.dirgha', 'models');
const MAX_STORAGE = 6 * 1024 * 1024 * 1024; // 6GB default

export class ModelManager {
  private storagePath: string;
  private maxStorage: number;
  private progressCallbacks: Set<(progress: DownloadProgress) => void> = new Set();

  constructor(options?: { storagePath?: string; maxStorage?: number }) {
    this.storagePath = options?.storagePath || DEFAULT_STORAGE_PATH;
    this.maxStorage = options?.maxStorage || MAX_STORAGE;
    this.ensureStoragePath();
  }

  private ensureStoragePath(): void {
    if (!existsSync(this.storagePath)) {
      mkdirSync(this.storagePath, { recursive: true });
    }
  }

  getModelPath(modelId: string): string {
    const model = getModelById(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    return join(this.storagePath, `${modelId}.bin`);
  }

  isInstalled(modelId: string): boolean {
    const path = this.getModelPath(modelId);
    return existsSync(path);
  }

  getInstalledSize(): number {
    let total = 0;
    for (const model of ALL_MODELS) {
      const path = this.getModelPath(model.id);
      if (existsSync(path)) {
        try {
          total += statSync(path).size;
        } catch {}
      }
    }
    return total;
  }

  getAvailableSpace(): number {
    return this.maxStorage - this.getInstalledSize();
  }

  async download(modelId: string, options?: {
    onProgress?: (progress: DownloadProgress) => void;
    resume?: boolean;
  }): Promise<void> {
    const model = getModelById(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    if (this.isInstalled(modelId)) {
      console.log(`Model ${model.name} already installed`);
      return;
    }

    const diskSize = model.diskSize || 0;
    const downloadUrl = model.downloadUrl || '';

    if (diskSize > this.getAvailableSpace()) {
      throw new Error(
        `Insufficient space. Need ${this.formatBytes(diskSize)}, ` +
        `available ${this.formatBytes(this.getAvailableSpace())}. ` +
        `Run 'dirgha models cleanup' to free space.`
      );
    }

    const outputPath = this.getModelPath(modelId);
    const tempPath = `${outputPath}.tmp`;

    console.log(`Downloading ${model.name}...`);
    console.log(`  Size: ${this.formatBytes(diskSize)}`);
    console.log(`  URL: ${downloadUrl}`);

    try {
      if (!downloadUrl) throw new Error(`Model ${modelId} has no download URL`);
      // Download with progress
      const response = await fetch(downloadUrl, {
        headers: options?.resume && existsSync(tempPath)
          ? { 'Range': `bytes=${statSync(tempPath).size}-` }
          : {}
      });

      if (!response.ok || !response.body) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const total = parseInt(response.headers.get('content-length') || '0') || diskSize;
      const fileStream = createWriteStream(tempPath, { flags: options?.resume ? 'a' : 'w' });

      let downloaded = options?.resume && existsSync(tempPath) ? statSync(tempPath).size : 0;
      const startTime = Date.now();

      // Track progress
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(Buffer.from(value));
        downloaded += value.length;

        const elapsed = (Date.now() - startTime) / 1000;
        const speed = downloaded / elapsed;

        const progress: DownloadProgress = {
          transferred: downloaded,
          total,
          percentage: Math.round((downloaded / (total || 1)) * 100),
          speed: `${this.formatBytes(speed)}/s`,
        };

        options?.onProgress?.(progress);
      }

      fileStream.end();
      await new Promise((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });

      // Verify checksum (simplified - real impl would compare SHA256)
      // For now, just check file size
      const finalSize = statSync(tempPath).size;
      if (finalSize < diskSize * 0.9) {
        throw new Error(`Download incomplete: ${finalSize} < ${diskSize}`);
      }

      // Rename temp to final
      const { renameSync } = await import('fs');
      renameSync(tempPath, outputPath);

      console.log(`✓ ${model.name} installed successfully`);
      console.log(`  Location: ${outputPath}`);

    } catch (error) {
      // Cleanup on failure
      try {
        const { unlinkSync } = await import('fs');
        if (existsSync(tempPath)) unlinkSync(tempPath);
      } catch {}
      throw error;
    }
  }

  async remove(modelId: string): Promise<void> {
    const model = getModelById(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const path = this.getModelPath(modelId);
    if (!existsSync(path)) {
      console.log(`Model ${model.name} not installed`);
      return;
    }

    const { unlinkSync } = await import('fs');
    unlinkSync(path);
    console.log(`✓ Removed ${model.name}`);
  }

  listInstalled(): ModelInfo[] {
    return ALL_MODELS.filter(m => this.isInstalled(m.id));
  }

  listAvailable(): ModelInfo[] {
    return ALL_MODELS.filter(m => !this.isInstalled(m.id));
  }

  async cleanup(): Promise<void> {
    const { readdirSync, unlinkSync } = await import('fs');
    const files = readdirSync(this.storagePath);
    let freed = 0;

    for (const file of files) {
      if (file.endsWith('.tmp')) {
        const path = join(this.storagePath, file);
        try {
          const size = statSync(path).size;
          unlinkSync(path);
          freed += size;
        } catch {}
      }
    }

    if (freed > 0) {
      console.log(`✓ Cleaned up ${this.formatBytes(freed)} of temporary files`);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getStorageStats(): { used: number; total: number; available: number; percentage: number } {
    const used = this.getInstalledSize();
    return {
      used,
      total: this.maxStorage,
      available: this.maxStorage - used,
      percentage: Math.round((used / this.maxStorage) * 100)
    };
  }
}

// Singleton instance
let manager: ModelManager | null = null;

export function getModelManager(options?: { storagePath?: string; maxStorage?: number }): ModelManager {
  if (!manager || options) {
    manager = new ModelManager(options);
  }
  return manager;
}
