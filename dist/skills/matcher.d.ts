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
export declare function matchSkills(skills: Skill[], ctx: MatchContext): Skill[];
