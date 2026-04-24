import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setWorkspaceRoot, sandboxPath } from './file.js';

// Each test gets its own workspace under /tmp so we never cross-contaminate.
let workspace: string;
const createdRoots: string[] = [];

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'dirgha-sandbox-'));
  createdRoots.push(workspace);
  mkdirSync(join(workspace, 'sub'), { recursive: true });
  writeFileSync(join(workspace, 'legit.txt'), 'hello');
  setWorkspaceRoot(workspace);
});

afterAll(() => {
  for (const p of createdRoots) {
    try { rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('sandboxPath — legit paths', () => {
  it('accepts a plain file in workspace root', () => {
    expect(() => sandboxPath('legit.txt')).not.toThrow();
  });

  it('accepts a file in a subdirectory', () => {
    writeFileSync(join(workspace, 'sub', 'a.txt'), 'ok');
    expect(() => sandboxPath('sub/a.txt')).not.toThrow();
  });

  it('accepts a new-file path in an existing subdirectory', () => {
    expect(() => sandboxPath('sub/new-file.txt')).not.toThrow();
  });

  it('accepts deeply nested new-file paths under existing roots', () => {
    expect(() => sandboxPath('sub/nested/deeper/file.txt')).not.toThrow();
  });

  it('accepts the workspace root itself (`.`)', () => {
    expect(() => sandboxPath('.')).not.toThrow();
  });

  it('accepts filenames with spaces and unicode', () => {
    const weird = 'sub/file with spaces and 中文.txt';
    writeFileSync(join(workspace, weird), 'ok');
    expect(() => sandboxPath(weird)).not.toThrow();
  });
});

describe('sandboxPath — traversal escapes', () => {
  it('rejects `..` parent-ref', () => {
    expect(() => sandboxPath('../outside.txt')).toThrow(/traversal|outside|escapes/);
  });

  it('rejects chained `../../` traversal', () => {
    expect(() => sandboxPath('../../../etc/passwd')).toThrow();
  });

  it('rejects traversal hidden in subpath', () => {
    expect(() => sandboxPath('sub/../../secret')).toThrow();
  });

  it('rejects a mix of legit component and traversal', () => {
    expect(() => sandboxPath('legit.txt/../../escape')).toThrow();
  });
});

describe('sandboxPath — absolute escapes', () => {
  it('rejects /etc/passwd', () => {
    expect(() => sandboxPath('/etc/passwd')).toThrow(/escapes|outside/);
  });

  it('rejects /root', () => {
    expect(() => sandboxPath('/root')).toThrow();
  });

  it('accepts an absolute path that points back inside the workspace', () => {
    // An absolute path that resolves to the workspace root itself is legit.
    expect(() => sandboxPath(join(workspace, 'legit.txt'))).not.toThrow();
  });
});

describe('sandboxPath — symlink escapes', () => {
  it('rejects a symlink inside workspace that points at /etc/passwd', () => {
    symlinkSync('/etc/passwd', join(workspace, 'link.txt'));
    expect(() => sandboxPath('link.txt')).toThrow(/symlink/);
  });

  it('rejects a path *through* a symlinked directory pointing outside', () => {
    symlinkSync('/etc', join(workspace, 'etc-link'));
    expect(() => sandboxPath('etc-link/passwd')).toThrow(/symlink/);
  });

  it('rejects a new-file write inside a symlinked directory pointing outside', () => {
    symlinkSync('/tmp', join(workspace, 'tmp-link'));
    // The parent realpath is /tmp which is outside the workspace.
    expect(() => sandboxPath('tmp-link/new-file.txt')).toThrow(/symlink/);
  });

  it('accepts a symlink inside workspace that points at another file inside workspace', () => {
    // A symlink whose target is still inside the workspace is legit.
    symlinkSync(join(workspace, 'legit.txt'), join(workspace, 'alias.txt'));
    expect(() => sandboxPath('alias.txt')).not.toThrow();
  });
});

describe('sandboxPath — edge cases', () => {
  it('accepts an empty path (resolves to workspace root)', () => {
    expect(() => sandboxPath('')).not.toThrow();
  });

  it('handles trailing slashes', () => {
    expect(() => sandboxPath('sub/')).not.toThrow();
  });

  it('handles multiple consecutive slashes', () => {
    expect(() => sandboxPath('sub//a.txt')).not.toThrow();
  });

  it('is idempotent — calling sandboxPath on its own result is safe', () => {
    const first = sandboxPath('legit.txt');
    expect(() => sandboxPath(first)).not.toThrow();
  });
});
