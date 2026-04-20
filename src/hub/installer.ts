/**
 * hub/installer.ts — Plugin installation manager.
 * npm, GitHub, and URL-based installs.
 */
import { execSync } from 'child_process';
import { mkdirSync, existsSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import type { PluginManifest, RegistryEntry, InstallOptions, InstallResult } from './types.js';

const PLUGINS_DIR = join(homedir(), '.dirgha', 'plugins');

function ensurePluginsDir(): void {
  if (!existsSync(PLUGINS_DIR)) mkdirSync(PLUGINS_DIR, { recursive: true });
}

function getPluginDir(name: string): string {
  return join(PLUGINS_DIR, name.replace(/^dirgha-/, ''));
}

function readManifest(dir: string): PluginManifest | null {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf-8'));
}

/** Install from npm. */
async function installFromNpm(
  entry: RegistryEntry,
  opts: InstallOptions
): Promise<InstallResult> {
  const targetDir = getPluginDir(entry.name);
  const existed = existsSync(targetDir);
  const oldManifest = existed ? readManifest(targetDir) : null;
  
  if (existed && !opts.force) {
    return {
      success: true,
      plugin: oldManifest!,
      path: targetDir,
      action: 'skipped',
      dependencies: []
    };
  }
  
  if (existed) rmSync(targetDir, { recursive: true });
  
  // npm pack + extract
  const pkgName = entry.sources.npm || entry.name;
  const version = opts.version ? `@${opts.version}` : '';
  
  const tmpDir = join(PLUGINS_DIR, '.tmp');
  mkdirSync(tmpDir, { recursive: true });
  
  try {
    execSync(`npm pack ${pkgName}${version} --pack-destination ${tmpDir}`, {
      cwd: tmpDir,
      stdio: opts.dryRun ? 'pipe' : 'inherit'
    });
    
    if (opts.dryRun) {
      return { success: true, action: 'skipped', plugin: {} as any, path: '', dependencies: [] };
    }
    
    const tarball = execSync(`ls ${tmpDir}/*.tgz`).toString().trim();
    mkdirSync(targetDir, { recursive: true });
    execSync(`tar -xzf ${tarball} --strip-components=1 -C ${targetDir}`);
    
    // Install dependencies
    const deps: string[] = [];
    if (existsSync(join(targetDir, 'package.json'))) {
      const pkg = JSON.parse(readFileSync(join(targetDir, 'package.json'), 'utf-8'));
      if (pkg.dependencies) {
        execSync('npm install --production', { cwd: targetDir, stdio: 'inherit' });
        deps.push(...Object.keys(pkg.dependencies));
      }
    }
    
    const manifest = readManifest(targetDir)!;
    manifest.installed = {
      path: targetDir,
      version: manifest.version,
      installedAt: new Date().toISOString()
    };
    writeFileSync(join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    
    return {
      success: true,
      plugin: manifest,
      path: targetDir,
      action: existed ? 'updated' : 'installed',
      previousVersion: oldManifest?.version,
      dependencies: deps
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Install from GitHub. */
async function installFromGitHub(
  entry: RegistryEntry,
  opts: InstallOptions
): Promise<InstallResult> {
  const targetDir = getPluginDir(entry.name);
  const existed = existsSync(targetDir);
  
  if (existed) rmSync(targetDir, { recursive: true });
  
  const repo = entry.sources.github!;
  const ref = opts.version || 'HEAD';
  
  if (!opts.dryRun) {
    execSync(`git clone --depth 1 --branch ${ref} https://github.com/${repo}.git ${targetDir}`,
      { stdio: 'inherit' }
    );
  }
  
  const manifest = readManifest(targetDir) || {
    name: entry.name,
    version: opts.version || '0.0.0',
    description: entry.description,
    author: entry.author,
    license: 'MIT',
    main: 'index.js',
    keywords: [],
    categories: entry.categories,
    engines: { dirgha: '>=2.0.0' },
    capabilities: []
  };
  
  return {
    success: true,
    plugin: manifest,
    path: targetDir,
    action: existed ? 'updated' : 'installed',
    dependencies: []
  };
}

/** Main install function. */
export async function installPlugin(
  entry: RegistryEntry,
  opts: InstallOptions = {}
): Promise<InstallResult> {
  ensurePluginsDir();
  
  if (opts.dryRun) {
    console.log(`Would install ${entry.name}@${opts.version || 'latest'} to ${getPluginDir(entry.name)}`);
    return { success: true, action: 'skipped', plugin: {} as any, path: '', dependencies: [] };
  }
  
  if (entry.sources.npm) {
    return installFromNpm(entry, opts);
  }
  if (entry.sources.github) {
    return installFromGitHub(entry, opts);
  }
  
  throw new Error(`No install source for ${entry.name}`);
}

/** Remove installed plugin. */
export function removePlugin(name: string): boolean {
  const dir = getPluginDir(name);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true });
  return true;
}

/** List installed plugins. */
export function listInstalled(): PluginManifest[] {
  if (!existsSync(PLUGINS_DIR)) return [];
  
  const entries: import('fs').Dirent[] = require('fs').readdirSync(PLUGINS_DIR, { withFileTypes: true });
  return entries
    .filter((e: import('fs').Dirent) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e: import('fs').Dirent) => readManifest(join(PLUGINS_DIR, e.name)))
    .filter(Boolean) as PluginManifest[];
}
