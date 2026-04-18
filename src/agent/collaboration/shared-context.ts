/**
 * agent/collaboration/shared-context.ts — Shared memory between agents
 * Phase 2: Collaborative context building and synchronization
 */

import { randomUUID } from 'node:crypto';
import type { AgentId } from '../orchestration/types.js';
import type { ContextEntry, ContextSnapshot } from './types.js';

export class SharedContext {
  private entries = new Map<string, ContextEntry>();
  private version = 0;
  private lastUpdated = new Date();
  private agentVersions = new Map<AgentId, number>();
  
  /** Set a context value */
  set(
    key: string,
    value: unknown,
    agentId: AgentId,
    options: { ttl?: number; merge?: boolean } = {}
  ): ContextEntry {
    const existing = this.entries.get(key);
    
    // Handle merge for objects
    let finalValue = value;
    if (options.merge && existing && typeof existing.value === 'object' && typeof value === 'object') {
      finalValue = { ...existing.value, ...value };
    }
    
    const entry: ContextEntry = {
      key,
      value: finalValue,
      agentId,
      timestamp: new Date(),
      version: (existing?.version || 0) + 1,
      ttl: options.ttl,
    };
    
    this.entries.set(key, entry);
    this.version++;
    this.lastUpdated = new Date();
    this.agentVersions.set(agentId, entry.version);
    
    return entry;
  }
  
  /** Get a context value */
  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    
    if (!entry) return undefined;
    
    // Check TTL
    if (entry.ttl) {
      const age = Date.now() - entry.timestamp.getTime();
      if (age > entry.ttl * 1000) {
        this.entries.delete(key);
        return undefined;
      }
    }
    
    return entry.value as T;
  }
  
  /** Get entry with metadata */
  getEntry(key: string): ContextEntry | undefined {
    return this.entries.get(key);
  }
  
  /** Check if key exists */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }
  
  /** Delete a context entry */
  delete(key: string, agentId: AgentId): boolean {
    const existed = this.entries.delete(key);
    if (existed) {
      this.version++;
      this.lastUpdated = new Date();
      this.agentVersions.set(agentId, this.version);
    }
    return existed;
  }
  
  /** Get all keys */
  keys(): string[] {
    return Array.from(this.entries.keys());
  }
  
  /** Get all entries */
  getAll(): Map<string, ContextEntry> {
    return new Map(this.entries);
  }
  
  /** Get entries by agent */
  getByAgent(agentId: AgentId): ContextEntry[] {
    return Array.from(this.entries.values())
      .filter(e => e.agentId === agentId);
  }
  
  /** Create snapshot */
  snapshot(): ContextSnapshot {
    return {
      entries: new Map(this.entries),
      version: this.version,
      lastUpdated: this.lastUpdated,
      agentCount: this.agentVersions.size,
    };
  }
  
  /** Restore from snapshot */
  restore(snapshot: ContextSnapshot): void {
    this.entries = new Map(snapshot.entries);
    this.version = snapshot.version;
    this.lastUpdated = snapshot.lastUpdated;
  }
  
  /** Merge another context into this one */
  merge(other: SharedContext, options: { overwrite?: boolean } = {}): void {
    for (const [key, entry] of other.entries) {
      if (options.overwrite || !this.entries.has(key)) {
        this.entries.set(key, { ...entry });
      }
    }
    this.version++;
    this.lastUpdated = new Date();
  }
  
  /** Sync with remote context (diff-based) */
  sync(remote: ContextSnapshot): { added: string[]; updated: string[]; deleted: string[] } {
    const added: string[] = [];
    const updated: string[] = [];
    const deleted: string[] = [];
    
    // Find new and updated entries
    for (const [key, entry] of remote.entries) {
      const local = this.entries.get(key);
      
      if (!local) {
        added.push(key);
        this.entries.set(key, entry);
      } else if (entry.version > local.version) {
        updated.push(key);
        this.entries.set(key, entry);
      }
    }
    
    // Find deleted entries
    for (const key of this.entries.keys()) {
      if (!remote.entries.has(key)) {
        deleted.push(key);
        this.entries.delete(key);
      }
    }
    
    if (added.length || updated.length || deleted.length) {
      this.version++;
      this.lastUpdated = new Date();
    }
    
    return { added, updated, deleted };
  }
  
  /** Get context diff since version */
  diff(sinceVersion: number): { added: ContextEntry[]; updated: ContextEntry[] } {
    const added: ContextEntry[] = [];
    const updated: ContextEntry[] = [];
    
    // This is simplified - real implementation would track version per entry
    for (const entry of this.entries.values()) {
      if (entry.version > sinceVersion) {
        if (entry.version === 1) {
          added.push(entry);
        } else {
          updated.push(entry);
        }
      }
    }
    
    return { added, updated };
  }
  
  /** Clear all entries */
  clear(agentId?: AgentId): void {
    if (agentId) {
      // Clear only entries by this agent
      for (const [key, entry] of this.entries) {
        if (entry.agentId === agentId) {
          this.entries.delete(key);
        }
      }
    } else {
      this.entries.clear();
    }
    
    this.version++;
    this.lastUpdated = new Date();
  }
  
  /** Clean expired entries */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.entries) {
      if (entry.ttl) {
        const age = now - entry.timestamp.getTime();
        if (age > entry.ttl * 1000) {
          this.entries.delete(key);
          cleaned++;
        }
      }
    }
    
    if (cleaned > 0) {
      this.version++;
    }
    
    return cleaned;
  }
  
  /** Get statistics */
  getStats(): {
    totalEntries: number;
    version: number;
    agentCount: number;
    expiredCount: number;
  } {
    const now = Date.now();
    let expired = 0;
    
    for (const entry of this.entries.values()) {
      if (entry.ttl && now - entry.timestamp.getTime() > entry.ttl * 1000) {
        expired++;
      }
    }
    
    return {
      totalEntries: this.entries.size,
      version: this.version,
      agentCount: this.agentVersions.size,
      expiredCount: expired,
    };
  }
  
  /** Export to JSON-serializable object */
  toJSON(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [key, entry] of this.entries) {
      obj[key] = entry.value;
    }
    return obj;
  }
  
  /** Import from JSON */
  fromJSON(data: Record<string, unknown>, agentId: AgentId): void {
    for (const [key, value] of Object.entries(data)) {
      this.set(key, value, agentId);
    }
  }
}

/** Create global shared context */
export const globalContext = new SharedContext();
