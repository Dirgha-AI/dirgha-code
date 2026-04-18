/**
 * skills/index.ts — Barrel exports for skill system.
 */
export { generateSkillMarkdown, writeSkillFile, buildDirghaSkill } from './generator.js';

/** Returns a system prompt snippet listing active skills. Empty until a registry is wired. */
export function getActiveSkillsPrompt(): string {
  return '';
}

/** Returns the system prompt for a specific named skill. Empty until a registry is wired. */
export function getSkillPrompt(_skillName: string): string {
  return '';
}
