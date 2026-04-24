/**
 * checkpoint/create.ts — Checkpoint creation
 */
import { createHash } from 'crypto';
import { readdir, readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import type { Checkpoint, CheckpointFile } from './types.js';
import { ensureShadowRepo, createCommit } from './git.js';

async function getFiles(dir: string, baseDir: string): Promise<CheckpointFile[]> {
  const files: CheckpointFile[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const relPath = relative(baseDir, path);
    
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    
    if (entry.isDirectory()) {
      files.push(...await getFiles(path, baseDir));
    } else {
      const content = await readFile(path);
      const stats = await stat(path);
      files.push({
        path: relPath,
        hash: createHash('sha256').update(content).digest('hex').slice(0, 16),
        size: stats.size
      });
    }
  }
  
  return files;
}

export async function createCheckpoint(
  projectPath: string,
  name: string
): Promise<Checkpoint> {
  const files = await getFiles(projectPath, projectPath);
  const shadowPath = await ensureShadowRepo(projectPath);
  const commitHash = createCommit(shadowPath, name, projectPath);
  
  return {
    id: `cp-${Date.now()}`,
    name,
    projectPath,
    files,
    createdAt: new Date().toISOString(),
    commitHash
  };
}
