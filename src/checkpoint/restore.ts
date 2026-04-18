/**
 * checkpoint/restore.ts — Rollback implementation
 */
import { restoreCommit } from './git.js';
import { getCheckpoint } from './store.js';
import type { Database } from '../utils/sqlite.js';

export async function restoreCheckpoint(
  db: Database,
  checkpointId: string,
  projectPath: string
): Promise<{ success: boolean; restored: number }> {
  const cp = getCheckpoint(db, checkpointId);
  if (!cp) throw new Error(`Checkpoint not found: ${checkpointId}`);
  
  const { ensureShadowRepo } = await import('./git.js');
  const shadowPath = await ensureShadowRepo(projectPath);
  
  let restoredFiles: string[] = [];
  if (cp.commitHash) {
    restoredFiles = restoreCommit(shadowPath, cp.commitHash, projectPath ?? process.cwd());
  }

  return { success: true, restored: restoredFiles.length || cp.files.length };
}
