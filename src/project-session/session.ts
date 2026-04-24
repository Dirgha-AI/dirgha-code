/**
 * project-session/session.ts — Session lifecycle, forking, merging
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Session, SessionStatus, CompressedContext, PalaceNode, ScratchpadEntry } from './types.js';

const DIRGHA_DIR = join(homedir(), '.dirgha');

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  create(
    projectId: string,
    name: string,
    parentId?: string
  ): Session {
    const id = `${projectId}:${name}`;
    const now = new Date().toISOString();
    
    const session: Session = {
      id,
      projectId,
      name,
      parentId,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      compressed: {
        summary: `Session "${name}" initialized.`,
        version: 1,
        compressedAt: now,
        originalTokens: 0,
        compressedTokens: 10
      },
      tree: [],
      scratchpad: []
    };

    // Create session directory
    const sessionDir = join(DIRGHA_DIR, 'projects', projectId, 'sessions', name);
    mkdirSync(sessionDir, { recursive: true });
    
    // Save session files
    writeFileSync(join(sessionDir, 'meta.json'), JSON.stringify(session, null, 2));
    writeFileSync(join(sessionDir, 'closet.md'), session.compressed.summary);
    writeFileSync(join(sessionDir, 'tree.json'), JSON.stringify(session.tree));
    writeFileSync(join(sessionDir, 'scratchpad.json'), JSON.stringify(session.scratchpad));

    this.sessions.set(id, session);
    return session;
  }

  fork(projectId: string, fromSessionId: string, newName: string): Session | null {
    const parent = this.sessions.get(fromSessionId);
    if (!parent) return null;

    const forked = this.create(projectId, newName, fromSessionId);
    
    // Copy parent's compressed context
    forked.compressed = {
      ...parent.compressed,
      summary: `[FORK from ${parent.name}] ${parent.compressed.summary}`
    };
    forked.tree = [...parent.tree];
    
    return forked;
  }

  merge(fromSessionId: string, intoSessionId: string): Session | null {
    const from = this.sessions.get(fromSessionId);
    const into = this.sessions.get(intoSessionId);
    
    if (!from || !into) return null;
    
    // Merge scratchpads
    into.scratchpad.push(...from.scratchpad);
    
    // Combine trees (union)
    const intoPaths = new Set(into.tree.map(n => n.path));
    for (const node of from.tree) {
      if (!intoPaths.has(node.path)) {
        into.tree.push(node);
      }
    }
    
    // Update compressed summary
    into.compressed.summary = `[MERGED ${from.name}] ${into.compressed.summary}`;
    into.compressed.version++;
    
    // Mark source as merged
    from.status = 'merged';
    
    return into;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(projectId: string): Session[] {
    // Fresh CLI invocations have an empty in-memory map; scan the
    // on-disk session directories so `session list` actually reports
    // what `session create` persisted in a previous invocation.
    const sessionsDir = join(DIRGHA_DIR, 'projects', projectId, 'sessions');
    if (existsSync(sessionsDir)) {
      for (const name of readdirSync(sessionsDir)) {
        const id = `${projectId}:${name}`;
        if (this.sessions.has(id)) continue;
        const metaPath = join(sessionsDir, name, 'meta.json');
        if (!existsSync(metaPath)) continue;
        try {
          const s = JSON.parse(readFileSync(metaPath, 'utf8')) as Session;
          this.sessions.set(id, s);
        } catch { /* skip unreadable session */ }
      }
    }
    return Array.from(this.sessions.values())
      .filter(s => s.projectId === projectId);
  }

  archive(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.status = 'archived';
    return true;
  }

  diff(sessionA: string, sessionB: string): { files: string[]; context: string } {
    const a = this.sessions.get(sessionA);
    const b = this.sessions.get(sessionB);
    
    if (!a || !b) return { files: [], context: '' };
    
    const aPaths = new Set(a.tree.map(n => n.path));
    const bPaths = new Set(b.tree.map(n => n.path));
    
    const onlyInA = [...aPaths].filter(p => !bPaths.has(p));
    const onlyInB = [...bPaths].filter(p => !aPaths.has(p));
    
    return {
      files: [...onlyInA, ...onlyInB],
      context: `A: ${onlyInA.length} unique, B: ${onlyInB.length} unique`
    };
  }
}
