/**
 * sync/wiki-git.test.ts — Wiki git-sync unit tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commitWiki, pullWiki, setWikiRemote, initWikiGit } from './wiki-git.js';

// Mock spawnSync so we don't need a real git installation
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
}));
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(existsSync).mockReturnValue(true); // .git exists by default
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as any);
});

describe('initWikiGit', () => {
  it('does nothing if .git already exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    initWikiGit();
    // Should NOT call git init
    const calls = vi.mocked(spawnSync).mock.calls.map(c => (c[1] as string[])[0]);
    expect(calls).not.toContain('init');
  });

  it('calls git init if .git does not exist', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      if (String(p).endsWith('.git')) return false;
      return true;
    });
    initWikiGit();
    const calls = vi.mocked(spawnSync).mock.calls.map(c => (c[1] as string[]));
    const initCall = calls.find(a => a[0] === 'init');
    expect(initCall).toBeDefined();
  });
});

describe('commitWiki', () => {
  it('returns false when nothing to commit (empty status)', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as any);
    const result = commitWiki('test commit');
    expect(result).toBe(false);
  });

  it('returns true when there are changes to commit', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0, stdout: 'M  wiki/article.md\n', stderr: '' } as any) // git status
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' } as any)  // git add
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' } as any); // git commit
    const result = commitWiki('chore: update');
    expect(result).toBe(true);
  });

  it('returns false when git commit fails', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0, stdout: 'M  file.md\n', stderr: '' } as any)
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' } as any)
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'error' } as any);
    const result = commitWiki('fail');
    expect(result).toBe(false);
  });
});

describe('pullWiki', () => {
  it('returns pulled:false when no remote configured', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as any); // no remotes
    const r = pullWiki();
    expect(r.pulled).toBe(false);
    expect(r.message).toContain('no remote');
  });

  it('returns pulled:true on successful pull', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0, stdout: 'origin\n', stderr: '' } as any) // git remote
      .mockReturnValueOnce({ status: 0, stdout: 'Already up to date.', stderr: '' } as any); // git pull
    const r = pullWiki();
    expect(r.pulled).toBe(true);
  });
});

describe('setWikiRemote', () => {
  it('calls git remote add origin with the url', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as any);
    const ok = setWikiRemote('https://github.com/user/wiki.git');
    expect(ok).toBe(true);
    const addCall = vi.mocked(spawnSync).mock.calls.find(
      c => (c[1] as string[]).includes('add')
    );
    expect(addCall).toBeDefined();
    expect(addCall![1]).toContain('https://github.com/user/wiki.git');
  });
});
