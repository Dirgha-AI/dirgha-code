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

/**
 * The shadow repo is a BARE git dir (no work tree of its own). To index
 * files from the project we point git at the project as the work tree
 * via GIT_WORK_TREE + GIT_DIR env vars, then commit into the bare shadow.
 */
export function createCommit(shadowPath: string, name: string, projectRoot: string): string {
  const env = { ...process.env, GIT_DIR: shadowPath, GIT_WORK_TREE: projectRoot };
  execSync('git add -A', { cwd: projectRoot, env });
  execSync(`git commit -m "checkpoint: ${name}" --allow-empty`, { cwd: projectRoot, env });
  return execSync('git rev-parse HEAD', { cwd: projectRoot, env }).toString().trim();
}

export function restoreCommit(shadowRepoPath: string, hash: string, projectRoot: string): string[] {
  const env = { ...process.env, GIT_DIR: shadowRepoPath, GIT_WORK_TREE: projectRoot };
  // List files in snapshot (exclude directory entries)
  const fileList = execSync(`git archive ${hash} --format=tar | tar -t`, {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
  }).trim().split('\n').filter(f => f && !f.endsWith('/'));

  // Extract to project root
  execSync(`git archive "${hash}" | tar -x -C "${projectRoot}"`, {
    cwd: projectRoot,
    env,
  });

  return fileList;
}
