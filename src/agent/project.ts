/**
 * agent/project.ts — Project root detection and utilities
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/** Walk up from cwd to find the nearest .git root (works for any project) */
export function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 12; i++) {
    if (existsSync(resolve(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
