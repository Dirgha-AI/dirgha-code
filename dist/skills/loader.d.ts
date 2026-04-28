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
export type SkillPlatform = 'cli' | 'daemon' | 'gateway' | 'acp';
export interface SkillMeta {
    name: string;
    description: string;
    version?: string;
    platforms?: SkillPlatform[];
    triggers?: {
        keywords?: string[];
        filePatterns?: string[];
    };
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
export declare function loadSkills(opts?: LoadSkillsOptions): Promise<Skill[]>;
export declare function parseSkill(text: string, path: string, source: Skill['source']): Skill | undefined;
