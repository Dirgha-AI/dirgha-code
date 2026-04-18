/**
 * knowledge/git-sync.ts — Git-backed sync for the local wiki store.
 *
 * Usage (called by `dirgha sync --wiki`):
 *   syncWikiToGit()              — commit staged changes, no push
 *   syncWikiToGit('origin')      — commit + push to remote
 *
 * The wiki lives at ~/.dirgha/knowledge/wiki/ (WIKI_DIR from wiki.ts).
 * Git repo is initialised on first call if not already present.
 */
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const WIKI_DIR = path.join(os.homedir(), '.dirgha', 'knowledge', 'wiki');

export interface GitSyncResult {
  committed: boolean;
  pushed: boolean;
  message: string;
}

function run(cmd: string): string {
  return execSync(cmd, { cwd: WIKI_DIR, stdio: 'pipe' }).toString().trim();
}

function isGitRepo(): boolean {
  try {
    run('git rev-parse --git-dir');
    return true;
  } catch {
    return false;
  }
}

function initRepo(): void {
  execSync('git init', { cwd: WIKI_DIR, stdio: 'pipe' });
  execSync('git add .', { cwd: WIKI_DIR, stdio: 'pipe' });
  try {
    execSync('git commit -m "wiki: initial commit"', { cwd: WIKI_DIR, stdio: 'pipe' });
  } catch {
    // Nothing to commit on fresh init — ok
  }
}

export async function syncWikiToGit(remote?: string): Promise<GitSyncResult> {
  // Ensure wiki dir exists
  const fs = await import('fs');
  if (!fs.existsSync(WIKI_DIR)) {
    fs.mkdirSync(WIKI_DIR, { recursive: true });
  }

  if (!isGitRepo()) {
    initRepo();
  }

  // Stage all changes
  execSync('git add .', { cwd: WIKI_DIR, stdio: 'pipe' });

  // Check if anything to commit
  const status = run('git status --porcelain');
  if (!status.trim()) {
    return { committed: false, pushed: false, message: 'Nothing to sync — wiki is up to date' };
  }

  const fileCount = status.split('\n').filter(Boolean).length;
  const timestamp = new Date().toISOString().slice(0, 16);

  try {
    execSync(`git commit -m "wiki: auto-sync ${timestamp}"`, { cwd: WIKI_DIR, stdio: 'pipe' });
  } catch (e: any) {
    // Commit failed (e.g. no user identity configured) — set a default
    execSync('git config user.email "dirgha-cli@local"', { cwd: WIKI_DIR, stdio: 'pipe' });
    execSync('git config user.name "Dirgha CLI"', { cwd: WIKI_DIR, stdio: 'pipe' });
    execSync(`git commit -m "wiki: auto-sync ${timestamp}"`, { cwd: WIKI_DIR, stdio: 'pipe' });
  }

  let pushed = false;
  if (remote) {
    // Determine current branch name
    let branch = 'main';
    try { branch = run('git rev-parse --abbrev-ref HEAD'); } catch { /* default */ }
    execSync(`git push ${remote} ${branch} --force`, { cwd: WIKI_DIR, stdio: 'pipe' });
    pushed = true;
  }

  return {
    committed: true,
    pushed,
    message: `Synced ${fileCount} file${fileCount !== 1 ? 's' : ''}${pushed ? ` → ${remote}` : ''}`,
  };
}
