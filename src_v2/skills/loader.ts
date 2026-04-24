/**
 * Skill discovery and loading.
 *
 * Skills are markdown files with YAML frontmatter. They are loaded from
 * three source roots in precedence order:
 *   1. <cwd>/.dirgha/skills/**<slash>SKILL.md  (project-local)
 *   2. ~/.dirgha/skills/**<slash>SKILL.md       (user-global)
 *   3. node_modules/dirgha-skill-*              (npm-distributed)
 *
 * Frontmatter is a simple key: value dialect (no nested structures).
 * The body below the closing `---` is the skill content injected into
 * the agent as a user message when the skill matches.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type SkillPlatform = 'cli' | 'daemon' | 'gateway' | 'acp';

export interface SkillMeta {
  name: string;
  description: string;
  version?: string;
  platforms?: SkillPlatform[];
  triggers?: { keywords?: string[]; filePatterns?: string[] };
  related?: string[];
}

export interface Skill {
  meta: SkillMeta;
  body: string;
  path: string;
  source: 'project' | 'user' | 'package';
}

export interface LoadSkillsOptions {
  cwd?: string;
  userHome?: string;
  packageRoots?: string[];
}

export async function loadSkills(opts: LoadSkillsOptions = {}): Promise<Skill[]> {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.userHome ?? homedir();
  const packageRoots = opts.packageRoots ?? [];

  const projectSkills = await discover(join(cwd, '.dirgha', 'skills'), 'project');
  const userSkills = await discover(join(home, '.dirgha', 'skills'), 'user');
  const packageSkills = (await Promise.all(packageRoots.map(root => discover(root, 'package')))).flat();

  const byName = new Map<string, Skill>();
  for (const skill of [...packageSkills, ...userSkills, ...projectSkills]) {
    byName.set(skill.meta.name, skill);
  }
  return [...byName.values()];
}

async function discover(root: string, source: Skill['source']): Promise<Skill[]> {
  const exists = await stat(root).then(s => s.isDirectory()).catch(() => false);
  if (!exists) return [];
  const out: Skill[] = [];
  await walk(root, async abs => {
    if (!abs.endsWith('/SKILL.md') && !abs.endsWith('SKILL.md')) return;
    const text = await readFile(abs, 'utf8').catch(() => undefined);
    if (!text) return;
    const parsed = parseSkill(text, abs, source);
    if (parsed) out.push(parsed);
  });
  return out;
}

async function walk(dir: string, onFile: (abs: string) => Promise<void>): Promise<void> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  for (const name of entries) {
    const abs = join(dir, name);
    const info = await stat(abs).catch(() => undefined);
    if (!info) continue;
    if (info.isDirectory()) await walk(abs, onFile);
    else if (info.isFile()) await onFile(abs);
  }
}

export function parseSkill(text: string, path: string, source: Skill['source']): Skill | undefined {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return undefined;
  const meta = parseFrontmatter(match[1]);
  if (!meta.name || !meta.description) return undefined;
  return {
    meta: meta as SkillMeta,
    body: match[2].trim(),
    path,
    source,
  };
}

function parseFrontmatter(raw: string): Partial<SkillMeta> {
  const out: Record<string, unknown> = {};
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = parseValue(value);
  }
  return out as Partial<SkillMeta>;
}

function parseValue(v: string): unknown {
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  if (v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  return v;
}
