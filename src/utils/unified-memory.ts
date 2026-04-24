import { readState } from './state.js';
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

type MemoryLayer = 'session' | 'project' | 'workspace' | 'global';
type MemoryType = 'fact' | 'rule' | 'lesson';

interface MemoryEntry {
  id: string;
  content: string;
  layer: MemoryLayer;
  type: MemoryType;
  tags: string[];
  source?: string;
  confidence?: number;
  topic?: string;
  condition?: string;
  action?: string;
  tier?: 'hot' | 'warm' | 'cold';
  truthScore?: number;
  createdAt: string;
}

const DIRGHA_DIR = join(homedir(), '.dirgha');
const MEM_DIR = join(DIRGHA_DIR, 'memory');
const MEM_FILE = join(MEM_DIR, 'memories.jsonl');

function ensureMemDir(): void {
  if (!existsSync(MEM_DIR)) mkdirSync(MEM_DIR, { recursive: true });
}

function readAll(): MemoryEntry[] {
  if (!existsSync(MEM_FILE)) return [];
  const lines = readFileSync(MEM_FILE, 'utf8').split('\n').filter(Boolean);
  const out: MemoryEntry[] = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch { /* skip corrupt line */ }
  }
  return out;
}

function appendOne(entry: MemoryEntry): void {
  ensureMemDir();
  appendFileSync(MEM_FILE, JSON.stringify(entry) + '\n');
}

function nextId(prefix = 'mem'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

class UnifiedMemory {
  private _sessionId: string | null = null;
  private _projectId: string | null = null;

  async retrieve(_k: string) { return null; }
  resumeSession(id: string) { this._sessionId = id; }
  async getContext(_opts?: any) { return []; }

  /**
   * Persist a fact to disk. Returns the entry so callers can show an ID.
   * File-backed JSONL under ~/.dirgha/memory/memories.jsonl.
   */
  store(content: string, opts: { layer?: MemoryLayer; type?: MemoryType; tags?: string[]; source?: string } = {}): MemoryEntry {
    const entry: MemoryEntry = {
      id: nextId(),
      content,
      layer: opts.layer ?? 'workspace',
      type: opts.type ?? 'fact',
      tags: opts.tags ?? [],
      source: opts.source,
      tier: 'hot',
      truthScore: 0.8,
      createdAt: new Date().toISOString(),
    };
    appendOne(entry);
    return entry;
  }

  addRule(condition: string, action: string, opts: { priority?: number; tags?: string[] } = {}): MemoryEntry {
    const entry: MemoryEntry = {
      id: nextId('rule'),
      content: `WHEN ${condition} THEN ${action}`,
      layer: 'workspace',
      type: 'rule',
      tags: opts.tags ?? [],
      condition,
      action,
      tier: 'hot',
      truthScore: 0.9,
      createdAt: new Date().toISOString(),
    };
    appendOne(entry);
    return entry;
  }

  learn(topic: string, content: string, opts: { confidence?: number; tags?: string[] } = {}): MemoryEntry {
    const entry: MemoryEntry = {
      id: nextId('lesson'),
      content,
      layer: 'workspace',
      type: 'lesson',
      topic,
      tags: opts.tags ?? [],
      confidence: opts.confidence ?? 0.7,
      tier: 'warm',
      truthScore: opts.confidence ?? 0.7,
      createdAt: new Date().toISOString(),
    };
    appendOne(entry);
    return entry;
  }

  /** Case-insensitive substring search. Small memory footprint; good enough until a proper index lands. */
  search(query: string, opts: { tags?: string[]; limit?: number } = {}): MemoryEntry[] {
    const q = (query || '').toLowerCase();
    const limit = opts.limit ?? 20;
    const tagFilter = opts.tags && opts.tags.length > 0 ? new Set(opts.tags) : null;
    return readAll()
      .filter(e => !q || e.content.toLowerCase().includes(q) || (e.topic ?? '').toLowerCase().includes(q))
      .filter(e => !tagFilter || e.tags.some(t => tagFilter.has(t)))
      .slice(-limit)
      .reverse();
  }

  recall(opts: { layer?: MemoryLayer; type?: MemoryType; tags?: string[]; topic?: string; minTruth?: number; limit?: number; includeTiers?: Array<'hot' | 'warm' | 'cold'> } = {}): MemoryEntry[] {
    const limit = opts.limit ?? 20;
    const minTruth = opts.minTruth ?? 0;
    const tagFilter = opts.tags && opts.tags.length > 0 ? new Set(opts.tags) : null;
    const tiers = opts.includeTiers ? new Set(opts.includeTiers) : null;
    return readAll()
      .filter(e => !opts.layer || e.layer === opts.layer)
      .filter(e => !opts.type || e.type === opts.type)
      .filter(e => !opts.topic || e.topic === opts.topic)
      .filter(e => !tagFilter || e.tags.some(t => tagFilter.has(t)))
      .filter(e => (e.truthScore ?? 1) >= minTruth)
      .filter(e => !tiers || tiers.has(e.tier ?? 'hot'))
      .slice(-limit)
      .reverse();
  }

  /**
   * Caller shape (memory-stats command) wants:
   *   totalEntries, activeSessions, byLayer, byTier,
   *   hotFacts, staleFacts, avgTruthScore.
   * Extra keys are harmless; missing keys throw. Keep the shape stable.
   */
  getStats(): {
    totalEntries: number;
    activeSessions: number;
    byLayer: Record<string, number>;
    byTier: Record<string, number>;
    hotFacts: number;
    staleFacts: number;
    avgTruthScore: number;
  } {
    const all = readAll();
    const byLayer: Record<string, number> = {};
    const byTier: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    let truthSum = 0;
    let hotFacts = 0;
    let staleFacts = 0;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const e of all) {
      byLayer[e.layer] = (byLayer[e.layer] ?? 0) + 1;
      const tier = e.tier ?? 'hot';
      byTier[tier] = (byTier[tier] ?? 0) + 1;
      truthSum += e.truthScore ?? 0.8;
      if (tier === 'hot') hotFacts++;
      if (new Date(e.createdAt).getTime() < thirtyDaysAgo) staleFacts++;
    }
    return {
      totalEntries: all.length,
      activeSessions: this._sessionId ? 1 : 0,
      byLayer,
      byTier,
      hotFacts,
      staleFacts,
      avgTruthScore: all.length > 0 ? truthSum / all.length : 0,
    };
  }

  startSession(projectId?: string, _description?: string): { id: string } {
    this._sessionId = `session-${Date.now()}`;
    this._projectId = projectId || null;
    return { id: this._sessionId };
  }
  getCurrentSessionId(): string | null { return this._sessionId; }
  endSession(): void { this._sessionId = null; this._projectId = null; }
  getCurrentProjectId(): string | null { return this._projectId; }
  getSessionContext(): any[] { return []; }
}

const getUnifiedMemory = () => new UnifiedMemory();

let memory: UnifiedMemory | null = null;

export function getMemory(): UnifiedMemory {
  if (!memory) {
    memory = getUnifiedMemory();
    const state = readState();
    if (state.lastSessionId) {
      memory.resumeSession(state.lastSessionId);
    }
  }
  return memory;
}
