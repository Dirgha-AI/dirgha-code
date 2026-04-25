/**
 * `dirgha update` — check for + install package updates.
 *
 *   dirgha update --check                Print current + latest version, no install
 *   dirgha update [--yes]                Check, prompt, then `npm i -g @dirgha/code@latest`
 *   dirgha update --packages             Re-clone every installed user-skill pack
 *   dirgha update --self [--yes]         Update binary only (skip packs)
 *
 * Always confirms before mutating state unless `--yes` is passed.
 * Audit-logs the upgrade so users can see what changed when.
 *
 * Initial implementation seeded by a hy3 dogfood run; ported here so the
 * subcommand surface lives where the rest of `dirgha *` verbs live.
 */
import type { Subcommand } from './index.js';
interface VersionCheck {
    current: string;
    latest: string | null;
    outdated: boolean;
    error?: string;
}
export declare function checkLatestVersion(opts: {
    pkg?: string;
    currentVersion: string;
    fetchImpl?: typeof fetch;
}): Promise<VersionCheck>;
/**
 * Compare two semver-shaped strings. Returns -1 / 0 / 1 like a string
 * comparator. Numeric segments compare numerically (so `1.10.0` > `1.9.9`);
 * pre-release suffixes sort below the bare release (`1.0.0-rc.1` < `1.0.0`).
 */
export declare function compareSemver(a: string, b: string): -1 | 0 | 1;
export interface InstalledPack {
    name: string;
    path: string;
    version?: string;
}
export declare function listInstalledPacks(opts?: {
    baseDir?: string;
}): InstalledPack[];
export declare const updateSubcommand: Subcommand;
export {};
