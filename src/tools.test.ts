import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeTool, executeToolAsync } from './tools/index.js';

// ── helpers ────────────────────────────────────────────────────────────────

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = mkdtempSync(join(tmpdir(), 'dirgha-test-'));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── read_file ──────────────────────────────────────────────────────────────

describe('read_file', () => {
  it('reads a file with line numbers', async () => {
    writeFileSync(join(tmpDir, 'hello.txt'), 'line one\nline two\n');
    const r = await executeToolAsync('read_file', { path: join(tmpDir, 'hello.txt') });
    expect(r.error).toBeUndefined();
    expect(r.result).toContain('1\tline one');
    expect(r.result).toContain('2\tline two');
  });

  it('returns error for missing file', async () => {
    const r = await executeToolAsync('read_file', { path: join(tmpDir, 'nope.txt') });
    expect(r.error).toBeTruthy();
  });

  it('truncates at 50k characters', async () => {
    const big = 'x'.repeat(60000);
    writeFileSync(join(tmpDir, 'big.txt'), big);
    const r = await executeToolAsync('read_file', { path: join(tmpDir, 'big.txt') });
    expect(r.result.length).toBeLessThanOrEqual(50050); // allow for line numbers overhead
    expect(r.result).toContain('[truncated]');
  });
});

// ── write_file ─────────────────────────────────────────────────────────────

describe('write_file', () => {
  it('writes content to a new file', () => {
    const p = join(tmpDir, 'out.txt');
    const r = executeTool('write_file', { path: p, content: 'hello' });
    expect(r.error).toBeUndefined();
    expect(existsSync(p)).toBe(true);
  });

  it('creates parent directories', () => {
    const p = join(tmpDir, 'deep', 'nested', 'file.ts');
    executeTool('write_file', { path: p, content: 'const x = 1;' });
    expect(existsSync(p)).toBe(true);
  });

  it('reports bytes written', () => {
    const r = executeTool('write_file', { path: join(tmpDir, 'f.txt'), content: 'abc' });
    expect(r.result).toContain('3 bytes');
  });
});

// ── edit_file ──────────────────────────────────────────────────────────────

describe('edit_file', () => {
  it('replaces old_string with new_string', () => {
    const p = join(tmpDir, 'edit.ts');
    writeFileSync(p, 'const foo = 1;\nconst bar = 2;\n');
    const r = executeTool('edit_file', { path: p, old_string: 'const foo = 1;', new_string: 'const foo = 99;' });
    expect(r.error).toBeUndefined();
    expect(readFileSync(p, 'utf8')).toContain('const foo = 99;');
  });

  it('returns error when old_string not found', () => {
    const p = join(tmpDir, 'edit2.ts');
    writeFileSync(p, 'const x = 1;');
    const r = executeTool('edit_file', { path: p, old_string: 'not here', new_string: 'y' });
    expect(r.error).toContain('not found');
  });

  it('returns error for missing file', () => {
    const r = executeTool('edit_file', { path: join(tmpDir, 'ghost.ts'), old_string: 'x', new_string: 'y' });
    expect(r.error).toBeTruthy();
  });
});

// ── search_files ───────────────────────────────────────────────────────────

describe('search_files', () => {
  it('finds pattern in files', () => {
    writeFileSync(join(tmpDir, 'a.ts'), 'export function hello() {}');
    const r = executeTool('search_files', { pattern: 'hello', path: tmpDir });
    expect(r.error).toBeUndefined();
    expect(r.result).toContain('hello');
  });

  it('returns no-matches message when pattern absent', () => {
    writeFileSync(join(tmpDir, 'b.ts'), 'const x = 1;');
    const r = executeTool('search_files', { pattern: 'zzz_not_here', path: tmpDir });
    expect(r.result).toContain('No matches found');
  });
});

// ── list_files ─────────────────────────────────────────────────────────────

describe('list_files', () => {
  it('lists files under a directory', () => {
    writeFileSync(join(tmpDir, 'foo.ts'), '');
    writeFileSync(join(tmpDir, 'bar.ts'), '');
    const r = executeTool('list_files', { pattern: tmpDir });
    expect(r.error).toBeUndefined();
    expect(r.result).toContain('foo.ts');
    expect(r.result).toContain('bar.ts');
  });

  it('blocks path traversal outside cwd', () => {
    // cwd = tmpDir (e.g. /tmp/dirgha-test-abc)
    // Try to list a sibling dir that starts with the same prefix
    const sibling = tmpDir + '-outside';
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, 'secret.txt'), 'secret');

    const r = executeTool('list_files', { pattern: sibling });
    // Should block because sibling is outside cwd
    expect(r.error).toBeTruthy();
    rmSync(sibling, { recursive: true, force: true });
  });

  it('blocks path traversal via ../  sequences', () => {
    const r = executeTool('list_files', { pattern: join(tmpDir, '..', 'etc') });
    expect(r.error).toBeTruthy();
  });
});

// ── run_command ────────────────────────────────────────────────────────────

describe('run_command', () => {
  it('runs a simple command', async () => {
    const r = await executeToolAsync('run_command', { command: 'echo dirgha-ok' });
    expect(r.error).toBeUndefined();
    expect(r.result.trim()).toBe('dirgha-ok');
  });

  it('rejects shell injection attempts', async () => {
    const r = await executeToolAsync('run_command', { command: 'echo hello; rm -rf /' });
    expect(r.result?.includes('hello') || r.error).toBeTruthy();
  });

  it('blocks dangerous commands', async () => {
    const r = await executeToolAsync('run_command', { command: 'rm -rf /tmp/test' });
    expect(r.error).toContain('blocked');
  });

  it('handles quoted arguments correctly', async () => {
    const r = await executeToolAsync('run_command', { command: 'echo "hello world"' });
    expect(r.error).toBeUndefined();
    expect(r.result?.trim()).toBe('hello world');
  });
});

// ── unknown tool ───────────────────────────────────────────────────────────

describe('executeTool', () => {
  it('returns error for unknown tool name', () => {
    const r = executeTool('does_not_exist', {});
    expect(r.error).toContain('Unknown tool');
  });
});

// ── git dispatcher ─────────────────────────────────────────────────────────

describe('executeTool git_branch dispatch', () => {
  it('routes git_branch to gitBranchTool', async () => {
    const r = await executeToolAsync('git_branch', {});
    expect(r.tool).toBe('git_branch');
  });

  it('routes git_stash to gitStashTool', async () => {
    const r = await executeToolAsync('git_stash', { action: 'list' });
    expect(r.tool).toBe('git_stash');
  });

  it('routes git_push to gitPushTool', async () => {
    const r = await executeToolAsync('git_push', {});
    expect(r.tool).toBe('git_push');
  });

  it('routes git_patch returns error when no patch', async () => {
    const r = await executeToolAsync('git_patch', {});
    expect(r.tool).toBe('git_patch');
    expect(r.error).toContain('patch is required');
  });
});
