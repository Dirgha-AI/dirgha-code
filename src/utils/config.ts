import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProjectConfig, ProjectContext } from '../types.js';

const CONFIG_DIR = '.dirgha';
const CONFIG_FILE = 'config.json';
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.dirgha');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, CONFIG_FILE);

function getProjectConfigPath(root?: string): string {
  const base = root ?? process.cwd();
  return path.join(base, CONFIG_DIR, CONFIG_FILE);
}

export function isProjectInitialized(root?: string): boolean {
  return fs.existsSync(getProjectConfigPath(root));
}

export function readProjectConfig(root?: string): ProjectConfig | null {
  const configPath = getProjectConfigPath(root);
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    return null;
  }
}

export function writeProjectConfig(config: ProjectConfig, root?: string): void {
  const configPath = getProjectConfigPath(root);
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

export function readGlobalConfig(): Partial<ProjectConfig> | null {
  if (!fs.existsSync(GLOBAL_CONFIG_FILE)) return null;
  try {
    const raw = fs.readFileSync(GLOBAL_CONFIG_FILE, 'utf8');
    return JSON.parse(raw) as Partial<ProjectConfig>;
  } catch {
    return null;
  }
}

export function writeGlobalConfig(config: Partial<ProjectConfig>): void {
  if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
    fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

export function createDefaultConfig(root?: string): ProjectConfig {
  const base = root ?? process.cwd();
  const projectName = path.basename(base);

  const emptyContext: ProjectContext = {
    files: [],
    structure: {
      root: base,
      directories: [],
      fileCount: 0,
      maxDepth: 0,
    },
    dependencies: {
      manager: 'unknown',
      dependencies: {},
      devDependencies: {},
      totalCount: 0,
    },
    git: null,
    importantFiles: [],
    ignoredPatterns: [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      '__pycache__',
      '*.lock',
    ],
  };

  return {
    version: '1.0.0',
    project: {
      name: projectName,
      root: base,
      type: 'generic',
      detectedAt: new Date().toISOString(),
    },
    context: emptyContext,
    preferences: {
      defaultModel: 'nemotron-3-nano-4b',
      defaultProvider: 'gateway',
      autoApply: false,
      verbose: false,
    },
  };
}

/** Alias used by commands/mcp.ts */
export const readConfig = readProjectConfig;
