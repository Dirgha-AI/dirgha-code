import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { gitCmd } from './safe-exec.js';
import type { ProjectContext } from '../types.js';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.turbo', 'coverage', '.cache', 'out', 'target', '.venv', 'venv',
]);

const MAX_FILES = 200;

export function detectProjectType(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'package.json'))) return 'node';
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) ||
      fs.existsSync(path.join(cwd, 'setup.py')) ||
      fs.existsSync(path.join(cwd, 'requirements.txt'))) return 'python';
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return 'rust';
  if (fs.existsSync(path.join(cwd, 'go.mod'))) return 'go';
  return 'generic';
}

function collectFiles(dir: string, base: string, depth: number, results: string[]): number {
  let maxDepth = depth;
  if (results.length >= MAX_FILES) return maxDepth;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return maxDepth;
  }
  for (const entry of entries) {
    if (results.length >= MAX_FILES) break;
    if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(base, fullPath);
    if (entry.isDirectory()) {
      const childMax = collectFiles(fullPath, base, depth + 1, results);
      if (childMax > maxDepth) maxDepth = childMax;
    } else {
      results.push(rel);
    }
  }
  return maxDepth;
}

function collectDirs(dir: string, base: string, results: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    results.push(path.relative(base, fullPath));
    collectDirs(fullPath, base, results);
  }
}

function readDependencies(root: string): ProjectContext['dependencies'] {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { manager: 'unknown', dependencies: {}, devDependencies: {}, totalCount: 0 };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps: Record<string, string> = pkg.dependencies ?? {};
    const devDeps: Record<string, string> = pkg.devDependencies ?? {};
    const manager = fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm'
      : fs.existsSync(path.join(root, 'yarn.lock')) ? 'yarn' : 'npm';
    return {
      manager,
      dependencies: deps,
      devDependencies: devDeps,
      totalCount: Object.keys(deps).length + Object.keys(devDeps).length,
    };
  } catch {
    return { manager: 'npm', dependencies: {}, devDependencies: {}, totalCount: 0 };
  }
}

function readGitInfo(root: string): ProjectContext['git'] {
  try {
    const branch = gitCmd(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root });
    const remote = gitCmd(['remote', 'get-url', 'origin'], { cwd: root });
    const lastCommit = gitCmd(['log', '-1', '--oneline'], { cwd: root }).slice(0, 72);
    const status = gitCmd(['status', '--porcelain'], { cwd: root });
    return { branch, remote, lastCommit, isClean: status.length === 0 };
  } catch {
    return null;
  }
}

function findImportantFiles(_root: string, files: string[]): string[] {
  const IMPORTANT_FILES = [
    'README.md', 'package.json', 'tsconfig.json', 'pyproject.toml',
    'Cargo.toml', 'go.mod', 'Makefile', 'Dockerfile', '.env.example',
  ];
  return IMPORTANT_FILES.filter(f =>
    files.some(file => file === f || file.endsWith('/' + f))
  );
}

export async function scanProject(): Promise<ProjectContext> {
  const root = process.cwd();
  const files: string[] = [];
  const maxDepth = collectFiles(root, root, 0, files);
  const directories: string[] = [];
  collectDirs(root, root, directories);

  return {
    files,
    structure: { root, directories, fileCount: files.length, maxDepth },
    dependencies: readDependencies(root),
    git: readGitInfo(root),
    importantFiles: findImportantFiles(root, files),
    ignoredPatterns: Array.from(IGNORED_DIRS),
  };
}

export function generateContextSummary(ctx: ProjectContext): string {
  const lines: string[] = [];
  lines.push(`Project root: ${ctx.structure.root}`);
  lines.push(`Files scanned: ${ctx.structure.fileCount} (max depth: ${ctx.structure.maxDepth})`);
  if (ctx.dependencies.totalCount > 0) {
    lines.push(`Dependencies: ${ctx.dependencies.totalCount} packages (${ctx.dependencies.manager})`);
  }
  if (ctx.git) {
    const clean = ctx.git.isClean ? 'clean' : 'dirty';
    lines.push(`Git: branch=${ctx.git.branch}, ${clean}, last="${ctx.git.lastCommit}"`);
  }
  if (ctx.importantFiles.length > 0) {
    lines.push(`Key files: ${ctx.importantFiles.join(', ')}`);
  }
  return lines.join('\n');
}
