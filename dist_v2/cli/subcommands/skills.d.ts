/**
 * `dirgha skills <list|show|where>` — inspect loadable behaviour packs.
 *
 * Skills are markdown files with YAML frontmatter at:
 *   1. <cwd>/.dirgha/skills/<name>/SKILL.md  (project-local)
 *   2. ~/.dirgha/skills/<name>/SKILL.md       (user-global)
 *   3. node_modules/dirgha-skill-* package roots (npm-distributed, opt-in)
 *
 * Project skills override user skills with the same name.
 *
 * Frontmatter keys: name, description, version?, platforms?, triggers?, related?
 */
import type { Subcommand } from './index.js';
export declare const skillsSubcommand: Subcommand;
