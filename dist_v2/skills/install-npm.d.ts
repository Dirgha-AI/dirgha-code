/**
 * Skill marketplace via npm: Allows installing skill packs from npm.
 * This module provides `installNpmSkill` to fetch and install a skill from an npm package.
 */
export interface InstallNpmResult {
    name: string;
    version: string;
    installedAt: string;
    bytes: number;
}
/**
 * Install a skill from an npm package.
 * @param spec - "npm:@scope/pack", "npm:@scope/pack@version", or "npm:plain-pkg"
 * @param nameOverride - optional folder name (default: derived from package.json's "name" stripped of @scope/)
 */
export declare function installNpmSkill(spec: string, nameOverride?: string): Promise<InstallNpmResult>;
