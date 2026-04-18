/**
 * project-session/context.ts — Context switching, stashing, boundaries
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Context, Boundary, Stash } from './types.js';

const DIRGHA_DIR = join(homedir(), '.dirgha');

// Per-terminal context file — uses parent PID to isolate concurrent sessions
function getTerminalId(): string {
  return String(process.ppid || process.pid);
}

export class ContextManager {
  private current: Context | null = null;
  private stashes: Map<string, Stash> = new Map();
  private terminalId: string;

  constructor() {
    this.terminalId = getTerminalId();
    this.loadCurrentContext();
    this.pruneStaleContexts();
  }

  private loadCurrentContext(): void {
    // Try per-terminal context first, fall back to legacy global
    const perTermPath = join(DIRGHA_DIR, 'contexts', `tty-${this.terminalId}.json`);
    const legacyPath = join(DIRGHA_DIR, 'contexts', 'current.json');
    const targetPath = existsSync(perTermPath) ? perTermPath : legacyPath;
    if (existsSync(targetPath)) {
      try {
        this.current = JSON.parse(readFileSync(targetPath, 'utf-8'));
      } catch {
        this.current = null;
      }
    }
  }

  /** Remove stale per-terminal context files older than 24h */
  private pruneStaleContexts(): void {
    const contextsDir = join(DIRGHA_DIR, 'contexts');
    if (!existsSync(contextsDir)) return;
    try {
      const now = Date.now();
      for (const file of readdirSync(contextsDir)) {
        if (!file.startsWith('tty-')) continue;
        const fullPath = join(contextsDir, file);
        const stat = statSync(fullPath);
        if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
          unlinkSync(fullPath);
        }
      }
    } catch { /* ignore cleanup errors */ }
  }

  switch(projectId: string, sessionId: string): Context {
    this.current = {
      projectId,
      sessionId,
      boundaries: [
        { type: 'project', value: projectId, allowRead: true, allowWrite: true }
      ]
    };
    this.saveCurrentContext();
    return this.current;
  }

  stash(name: string): Stash | null {
    if (!this.current) return null;
    
    const id = `stash-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const stash: Stash = {
      id,
      name,
      createdAt: new Date().toISOString(),
      context: { ...this.current },
      preview: `Project: ${this.current.projectId}, Session: ${this.current.sessionId}`
    };

    const stashesDir = join(DIRGHA_DIR, 'stashes');
    mkdirSync(stashesDir, { recursive: true });
    writeFileSync(join(stashesDir, `${id}.json`), JSON.stringify(stash, null, 2));
    
    this.stashes.set(id, stash);
    return stash;
  }

  popStash(stashId: string): Context | null {
    const stash = this.stashes.get(stashId);
    if (!stash) return null;
    
    this.current = stash.context;
    this.saveCurrentContext();
    this.stashes.delete(stashId);
    
    return this.current;
  }

  linkProject(fromProjectId: string, toProjectId: string, alias: string): boolean {
    if (!this.current || this.current.projectId !== fromProjectId) {
      return false;
    }
    
    // Add boundary for linked project
    this.current.boundaries.push({
      type: 'project',
      value: toProjectId,
      allowRead: true,
      allowWrite: false  // Read-only by default
    });
    
    this.saveCurrentContext();
    return true;
  }

  checkBoundary(action: string, target: string): { allowed: boolean; reason?: string } {
    if (!this.current) return { allowed: true };
    
    // Check if target is within any boundary
    for (const boundary of this.current.boundaries) {
      if (target.startsWith(boundary.value)) {
        if (action === 'write' && !boundary.allowWrite) {
          return { 
            allowed: false, 
            reason: `Write access denied to ${target}. Use 'dirgha context link ${target} --as <alias>' to enable access.`
          };
        }
        return { allowed: true };
      }
    }
    
    // Cross-project access check
    const isCrossProject = (target.includes('/') || target.includes(':')) && !target.startsWith(this.current.projectId);
    if (isCrossProject) {
      return {
        allowed: false,
        reason: `Cross-project access denied. Use 'dirgha context link ${target.split(/[:\/]/)[0]} --as <alias>' to enable access.`
      };
    }
    
    return { allowed: true };
  }

  getCurrent(): Context | null {
    return this.current;
  }

  listStashes(): Stash[] {
    return Array.from(this.stashes.values());
  }

  private saveCurrentContext(): void {
    if (!this.current) return;

    const contextsDir = join(DIRGHA_DIR, 'contexts');
    mkdirSync(contextsDir, { recursive: true });
    // Write per-terminal context file (not global)
    writeFileSync(
      join(contextsDir, `tty-${this.terminalId}.json`),
      JSON.stringify(this.current, null, 2)
    );
  }
}
