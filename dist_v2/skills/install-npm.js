/**
 * Skill marketplace via npm: Allows installing skill packs from npm.
 * This module provides `installNpmSkill` to fetch and install a skill from an npm package.
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const execFile = promisify(execFileCb);
/**
 * Install a skill from an npm package.
 * @param spec - "npm:@scope/pack", "npm:@scope/pack@version", or "npm:plain-pkg"
 * @param nameOverride - optional folder name (default: derived from package.json's "name" stripped of @scope/)
 */
export async function installNpmSkill(spec, nameOverride) {
    // Parse spec
    if (!spec.startsWith('npm:')) {
        throw new Error(`Invalid spec: "${spec}". Must start with "npm:"`);
    }
    const pkgSpec = spec.slice(4).trim();
    // Package names must start with a letter or digit — leading dashes
    // would otherwise pass through to `npm pack` as a flag (argument
    // injection). Regex enforces this for both scope and package parts.
    const npmRegex = /^(@[a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9._-]*(@[a-zA-Z0-9.+_-]+)?$/;
    if (!npmRegex.test(pkgSpec)) {
        throw new Error(`Invalid npm package spec: "${pkgSpec}". Expected something like "@scope/package" or "package@version".`);
    }
    const tempDir = path.join(os.tmpdir(), `dirgha-skill-${randomUUID()}`);
    await fs.mkdir(tempDir);
    try {
        // npm pack — `--` separator before pkgSpec so even if a future regex
        // gap let through a "-flag-like" name, npm treats it as positional.
        const { stdout } = await execFile('npm', ['pack', '--silent', '--pack-destination', '.', '--', pkgSpec], { cwd: tempDir });
        const lines = stdout.trim().split('\n');
        const tgzName = lines[lines.length - 1].trim();
        if (!tgzName.endsWith('.tgz')) {
            throw new Error(`Unexpected npm pack output: ${tgzName}`);
        }
        // Extract tarball
        await execFile('tar', ['-xzf', tgzName], { cwd: tempDir });
        const packageDir = path.join(tempDir, 'package');
        // Validate SKILL.md exists
        const skillMdPath = path.join(packageDir, 'SKILL.md');
        try {
            await fs.access(skillMdPath);
        }
        catch {
            throw new Error(`Skill "${pkgSpec}" missing SKILL.md at package root`);
        }
        // Read package.json
        const packageJsonPath = path.join(packageDir, 'package.json');
        const pkgJsonRaw = await fs.readFile(packageJsonPath, 'utf8');
        const { name: pkgName, version } = JSON.parse(pkgJsonRaw);
        // Determine skill name (folder).
        // Default: strip @scope/ from pkgName so "@dirgha-skills/git-helper"
        // installs as "git-helper". nameOverride wins if provided.
        const stripScope = (n) => {
            if (n.startsWith('@')) {
                const parts = n.split('/');
                return parts.length === 2 && parts[1] ? parts[1] : n;
            }
            return n;
        };
        const folderName = nameOverride ?? stripScope(pkgName);
        // Compute size of SKILL.md
        const skillMdContent = await fs.readFile(skillMdPath);
        const bytes = skillMdContent.length;
        // Target installation directory
        const targetDir = path.join(os.homedir(), '.dirgha', 'skills', folderName);
        // Ensure not already installed
        try {
            await fs.stat(targetDir);
            throw new Error(`Skill already installed at ${targetDir}. Uninstall first.`);
        }
        catch (err) {
            if (err.code !== 'ENOENT')
                throw err;
        }
        // Create parent directories if needed
        await fs.mkdir(path.dirname(targetDir), { recursive: true });
        // Move package to target
        await fs.rename(packageDir, targetDir);
        return {
            name: folderName,
            version,
            installedAt: targetDir,
            bytes,
        };
    }
    finally {
        // Clean up temp directory
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}
//# sourceMappingURL=install-npm.js.map