/**
 * agent/skill-registry.ts — Persistent skill registry (Week 2 of self-evolve sprint)
 *
 * Stores reusable tool-sequence patterns learned from successful sessions.
 * Before executing a tool, checks if a matching skill exists and prepends it to context.
 *
 * Inspired by: SuperAGI (skill registry), Agent Zero (error memory), Letta Code (reusable skills).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillTrigger {
  contextFingerprint?: string;  // e.g. 'ts+jest+Cannot find module'
  errorRegex?: string;          // match stderr/error text
  taskType?: string;            // 'bugfix' | 'feature' | etc.
}

export interface ToolStep {
  tool: string;
  description: string;  // human-readable what this step does
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: SkillTrigger;
  steps: ToolStep[];
  hint: string;         // injected into system prompt when triggered
  metadata: {
    successRate: number;
    uses: number;
    createdAt: number;
    lastUsed: number;
    source: 'auto' | 'manual';  // auto = promoted from reflection, manual = dirgha learn
    tags: string[];
  };
}

interface SkillStore { version: string; skills: Skill[]; }

// ─── Paths ────────────────────────────────────────────────────────────────────

const SKILLS_PATH = path.join(os.homedir(), '.dirgha', 'skills.json');

function load(): SkillStore {
  try {
    if (fs.existsSync(SKILLS_PATH)) {
      return JSON.parse(fs.readFileSync(SKILLS_PATH, 'utf8'));
    }
  } catch { /* corrupt — reset */ }
  return { version: '1', skills: [] };
}

function save(store: SkillStore): void {
  fs.mkdirSync(path.dirname(SKILLS_PATH), { recursive: true });
  fs.writeFileSync(SKILLS_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function score(skill: Skill, context: string, errorText?: string): number {
  let s = 0;
  const t = skill.trigger;
  if (t.contextFingerprint && context.toLowerCase().includes(t.contextFingerprint.toLowerCase())) s += 2;
  if (t.errorRegex && errorText && new RegExp(t.errorRegex, 'i').test(errorText)) s += 3;
  return s;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Find matching skills for current context, ranked by relevance */
export function matchSkills(context: string, errorText?: string, limit = 3): Skill[] {
  const store = load();
  return store.skills
    .map(sk => ({ sk, s: score(sk, context, errorText) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || b.sk.metadata.successRate - a.sk.metadata.successRate)
    .slice(0, limit)
    .map(x => x.sk);
}

/** Get a formatted hint block to inject into system prompt */
export function getSkillHints(context: string, errorText?: string): string {
  const matched = matchSkills(context, errorText);
  if (matched.length === 0) return '';
  const lines = matched.map(sk => `• [${sk.name}] ${sk.hint}`);
  return `\n<learned_patterns>\n${lines.join('\n')}\n</learned_patterns>\n`;
}

/** Record a new skill (called after successful reflection promotes it) */
export function recordSkill(skill: Omit<Skill, 'id' | 'metadata'> & Partial<Skill>): void {
  const store = load();
  const existing = store.skills.find(s => s.name === skill.name);
  if (existing) {
    // Update success rate (exponential moving average)
    existing.metadata.uses++;
    existing.metadata.successRate = existing.metadata.successRate * 0.8 + 0.2;
    existing.metadata.lastUsed = Date.now();
  } else {
    store.skills.push({
      ...skill,
      id: crypto.randomUUID().slice(0, 8),
      metadata: {
        successRate: 0.8,
        uses: 1,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        source: 'auto',
        tags: skill.metadata?.tags ?? [],
      },
    } as Skill);
  }
  save(store);
}

/** Update success rate after a skill was used */
export function updateSkillOutcome(skillId: string, success: boolean): void {
  const store = load();
  const sk = store.skills.find(s => s.id === skillId);
  if (!sk) return;
  sk.metadata.uses++;
  sk.metadata.lastUsed = Date.now();
  // EMA: blend 20% new signal
  sk.metadata.successRate = sk.metadata.successRate * 0.8 + (success ? 1 : 0) * 0.2;
  // Prune skills with <20% success rate after 10+ uses
  if (sk.metadata.successRate < 0.2 && sk.metadata.uses > 10) {
    store.skills = store.skills.filter(s => s.id !== skillId);
  }
  save(store);
}

/** List all skills (for `dirgha skills` command) */
export function listSkills(): Skill[] {
  return load().skills.sort((a, b) => b.metadata.lastUsed - a.metadata.lastUsed);
}

/** Manually record skill from CLI (`dirgha learn`) */
export function learnSkill(name: string, description: string, hint: string, tags: string[]): void {
  recordSkill({
    name,
    description,
    trigger: {},
    steps: [],
    hint,
    metadata: { successRate: 0.8, uses: 1, createdAt: Date.now(), lastUsed: Date.now(), source: 'manual', tags },
  });
}
