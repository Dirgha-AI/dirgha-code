/**
 * Skill runtime. Takes the matched skill set and renders them into a
 * single user-role message that precedes the live user prompt. Skills
 * are always injected as user content (not system) so that the provider
 * cache boundary sits above them and per-turn changes do not invalidate
 * the parent cache entry.
 */
import type { Message } from '../kernel/types.js';
import type { Skill } from './loader.js';
export interface SkillInjectionOptions {
    header?: string;
}
export declare function injectSkills(messages: Message[], skills: Skill[], opts?: SkillInjectionOptions): Message[];
