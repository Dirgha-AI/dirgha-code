import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { Checkpoint } from '../types.js';

function checkpointDir(): string {
  const cwdHash = crypto.createHash('md5').update(process.cwd()).digest('hex').slice(0, 8);
  return path.join(os.homedir(), '.dirgha', 'checkpoints', cwdHash);
}

function indexPath(): string {
  return path.join(checkpointDir(), 'index.json');
}

function ensureRepo(): void {
  const dir = checkpointDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const gitDir = path.join(dir, '.git');
  if (!fs.existsSync(gitDir)) {
    execSync('git init', { cwd: dir, encoding: 'utf8' });
    execSync('git config user.email "cli@dirgha.ai"', { cwd: dir, encoding: 'utf8' });
    execSync('git config user.name "Dirgha CLI"', { cwd: dir, encoding: 'utf8' });
  }
}

function readIndex(): Checkpoint[] {
  const p = indexPath();
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as Checkpoint[]; } catch { return []; }
}

function writeIndex(checkpoints: Checkpoint[]): void {
  fs.writeFileSync(indexPath(), JSON.stringify(checkpoints, null, 2), 'utf8');
}

export async function createCheckpoint(description: string): Promise<string> {
  ensureRepo();
  const dir = checkpointDir();
  const cwd = process.cwd();

  // Copy tracked files into shadow repo
  const out = spawnSync('git', ['ls-files'], { cwd, encoding: 'utf8' });
  const files = out.stdout.trim().split('\n').filter(Boolean);
  for (const f of files) {
    const src = path.join(cwd, f);
    const dest = path.join(dir, f);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }

  // Commit in shadow repo
  execSync('git add -A', { cwd: dir, encoding: 'utf8' });
  const id = crypto.randomBytes(4).toString('hex');
  try {
    execSync(`git commit -m "checkpoint ${id}: ${description.slice(0, 60)}"`, { cwd: dir, encoding: 'utf8' });
  } catch { /* nothing to commit */ }

  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' });
  const gitRef = result.stdout.trim();

  const checkpoint: Checkpoint = { id, timestamp: new Date().toISOString(), description, cwd, gitRef };
  const index = readIndex();
  index.push(checkpoint);
  writeIndex(index);
  return id;
}

export function listCheckpoints(): Checkpoint[] {
  return readIndex();
}

export async function restoreCheckpoint(id: string): Promise<void> {
  const checkpoints = readIndex();
  const cp = checkpoints.find(c => c.id === id || c.id.startsWith(id));
  if (!cp) throw new Error(`Checkpoint not found: ${id}`);

  const dir = checkpointDir();
  execSync(`git checkout ${cp.gitRef} -- .`, { cwd: dir, encoding: 'utf8' });

  // Copy files back to cwd
  const cwd = cp.cwd;
  const out = spawnSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' });
  const files = out.stdout.trim().split('\n').filter(Boolean);
  for (const f of files) {
    const src = path.join(dir, f);
    const dest = path.join(cwd, f);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}
