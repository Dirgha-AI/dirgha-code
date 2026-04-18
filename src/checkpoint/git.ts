/**
 * checkpoint/git.ts — Shadow-git operations
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const SHADOW_DIR = join(homedir(), '.dirgha', 'checkpoints');

export async function ensureShadowRepo(projectPath: string): Promise<string> {
  const projectHash = Buffer.from(projectPath).toString('base64').slice(0, 16);
  const shadowPath = join(SHADOW_DIR, projectHash);
  
  if (!existsSync(shadowPath)) {
    await mkdir(shadowPath, { recursive: true });
    execSync('git init --bare', { cwd: shadowPath });
  }
  
  return shadowPath;
}

export function createCommit(shadowPath: string, name: string): string {
  execSync('git add -A', { cwd: shadowPath });
  execSync(`git commit -m "checkpoint: ${name}" --allow-empty`, { cwd: shadowPath });
  return execSync('git rev-parse HEAD', { cwd: shadowPath }).toString().trim();
}

export function restoreCommit(shadowRepoPath: string, hash: string, projectRoot: string): string[] {
  // List files in snapshot (exclude directory entries)
  const fileList = execSync(`git archive ${hash} --format=tar | tar -t`, {
    cwd: shadowRepoPath,
    encoding: 'utf8',
  }).trim().split('\n').filter(f => f && !f.endsWith('/'));

  // Extract to project root
  execSync(`git archive "${hash}" | tar -x -C "${projectRoot}"`, {
    cwd: shadowRepoPath,
  });

  return fileList;
}
