/**
 * sync/wiki-git.ts — Git-backed sync for the PAL knowledge wiki.
 *
 * The wiki directory (~/.dirgha/knowledge/) is a local git repo.
 * - commitWiki(msg) — stage all changes and commit after compile
 * - pullWiki()      — git pull on startup (if remote is configured)
 * - initWikiGit()   — git init + initial commit if no .git exists
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const WIKI_DIR = join(homedir(), '.dirgha', 'knowledge');

function git(args: string[], cwd = WIKI_DIR): { ok: boolean; out: string; err: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10_000 });
  return { ok: r.status === 0, out: r.stdout ?? '', err: r.stderr ?? '' };
}

/** Initialise git repo in the wiki directory if it doesn't exist. */
export function initWikiGit(): void {
  if (!existsSync(WIKI_DIR)) mkdirSync(WIKI_DIR, { recursive: true });
  if (existsSync(join(WIKI_DIR, '.git'))) return;
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 'dirgha-cli@local']);
  git(['config', 'user.name', 'Dirgha CLI']);
  // Commit empty init so HEAD exists
  git(['commit', '--allow-empty', '-m', 'chore: init wiki repo']);
}

/**
 * Stage all changes in the wiki directory and commit.
 * No-op if there is nothing to commit.
 */
export function commitWiki(message = 'chore: wiki compile'): boolean {
  try {
    initWikiGit();
    const status = git(['status', '--porcelain']);
    if (!status.out.trim()) return false; // nothing to commit
    git(['add', '-A']);
    const r = git(['commit', '-m', message]);
    return r.ok;
  } catch { return false; }
}

/**
 * Pull from remote if one is configured.
 * Completely silent on failure — wiki sync is best-effort.
 */
export function pullWiki(): { pulled: boolean; message: string } {
  try {
    initWikiGit();
    // Check if any remote is set
    const remotes = git(['remote']);
    if (!remotes.out.trim()) {
      return { pulled: false, message: 'no remote configured' };
    }
    const r = git(['pull', '--ff-only', '--quiet']);
    return { pulled: r.ok, message: r.ok ? 'ok' : r.err.trim().slice(0, 80) };
  } catch { return { pulled: false, message: 'git not available' }; }
}

/** Add a remote origin for wiki sync (e.g. a private GitHub repo). */
export function setWikiRemote(url: string): boolean {
  try {
    initWikiGit();
    // Remove existing origin if present
    git(['remote', 'remove', 'origin']);
    const r = git(['remote', 'add', 'origin', url]);
    return r.ok;
  } catch { return false; }
}
