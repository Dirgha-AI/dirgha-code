/**
 * repl/slash/git.test.ts — Unit tests for git slash commands
 */
import { describe, it, expect } from 'vitest';

describe('getGitMode / git-mode command', () => {
  it('default mode is auto', async () => {
    const { getGitMode } = await import('./git.js');
    expect(getGitMode()).toBe('auto');
  });

  it('/git-mode shows current mode when no args', async () => {
    const { gitCommands } = await import('./git.js');
    const cmd = gitCommands.find(c => c.name === 'git-mode');
    expect(cmd).toBeDefined();
    const result = await cmd!.handler!('', {} as any);
    expect(typeof result).toBe('string');
    expect(result).toContain('auto');
  });

  it('/git-mode diff sets mode to diff', async () => {
    const { gitCommands, getGitMode } = await import('./git.js');
    const cmd = gitCommands.find(c => c.name === 'git-mode');
    await cmd!.handler!('diff', {} as any);
    expect(getGitMode()).toBe('diff');
    // Reset
    await cmd!.handler!('auto', {} as any);
  });

  it('/git-mode rejects invalid mode', async () => {
    const { gitCommands } = await import('./git.js');
    const cmd = gitCommands.find(c => c.name === 'git-mode');
    const result = await cmd!.handler!('invalid-mode', {} as any);
    expect(result).toContain('Invalid mode');
  });
});

describe('git slash commands registration', () => {
  it('exports gitCommands array', async () => {
    const { gitCommands } = await import('./git.js');
    expect(Array.isArray(gitCommands)).toBe(true);
    expect(gitCommands.length).toBeGreaterThan(0);
  });

  it('has all expected commands', async () => {
    const { gitCommands } = await import('./git.js');
    const names = gitCommands.map(c => c.name);
    expect(names).toContain('diff');
    expect(names).toContain('commit');
    expect(names).toContain('git-mode');
    expect(names).toContain('stash');
    expect(names).toContain('push');
    expect(names).toContain('branch');
  });

  it('each command has a handler or execute function', async () => {
    const { gitCommands } = await import('./git.js');
    for (const cmd of gitCommands) {
      expect(cmd.handler ?? cmd.execute).toBeDefined();
    }
  });
});
