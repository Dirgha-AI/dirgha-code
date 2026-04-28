/**
 * Match skills to the current turn. A skill matches when the platform
 * allows it and at least one trigger (keyword or file-pattern) fires.
 * When no triggers are declared the skill is considered ambient and
 * always matches for its allowed platforms.
 */

import type { Skill, SkillPlatform } from './loader.js';

export interface MatchContext {
  platform: SkillPlatform;
  userMessage?: string;
  files?: string[];
  explicit?: string[];
}

export function matchSkills(skills: Skill[], ctx: MatchContext): Skill[] {
  const out: Skill[] = [];
  for (const skill of skills) {
    if (!platformOk(skill, ctx.platform)) continue;
    if (ctx.explicit?.includes(skill.meta.name)) { out.push(skill); continue; }
    if (triggersMatch(skill, ctx)) out.push(skill);
  }
  return out;
}

function platformOk(skill: Skill, platform: SkillPlatform): boolean {
  const allowed = skill.meta.platforms;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(platform);
}

function triggersMatch(skill: Skill, ctx: MatchContext): boolean {
  const triggers = skill.meta.triggers;
  if (!triggers) return false;
  const keywords = triggers.keywords ?? [];
  const filePatterns = triggers.filePatterns ?? [];
  if (keywords.length === 0 && filePatterns.length === 0) return false;

  const message = (ctx.userMessage ?? '').toLowerCase();
  for (const kw of keywords) {
    if (message.includes(kw.toLowerCase())) return true;
  }
  const files = ctx.files ?? [];
  for (const pattern of filePatterns) {
    const rx = globToRegex(pattern);
    for (const f of files) {
      if (rx.test(f)) return true;
    }
  }
  return false;
}

function globToRegex(pattern: string): RegExp {
  let rx = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') { rx += '.*'; i++; } else rx += '[^/]*';
    } else if (ch === '?') rx += '[^/]';
    else if (/[.+^${}()|[\]\\]/.test(ch)) rx += `\\${ch}`;
    else rx += ch;
  }
  rx += '$';
  return new RegExp(rx);
}
