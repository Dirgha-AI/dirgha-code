// @ts-nocheck

/**
 * rivet/wasm-commands.test.ts — Tests for WASM command execution
 */
import { describe, it, expect } from 'vitest';
import { wasmExecutor, wasm, pipeline, WASM_COMMANDS } from './wasm-commands.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('wasmExecutor', () => {
  it('validates unknown commands', async () => {
    // @ts-expect-error Testing invalid command
    const result = await wasmExecutor.execute('invalid_cmd', []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('executes echo command', async () => {
    const result = await wasm('echo', ['hello', 'world']);
    expect(result.success).toBe(true);
    expect(result.output.trim()).toBe('hello world');
  });

  it('executes cat command', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'wasm-test-'));
    const testFile = join(tmpDir, 'test.txt');
    writeFileSync(testFile, 'test content');

    const result = await wasm('cat', [testFile]);
    expect(result.success).toBe(true);
    expect(result.output).toBe('test content');

    rmSync(tmpDir, { recursive: true });
  });

  it('executes grep command', async () => {
    const result = await wasm('grep', ['hello'], { input: 'hello world\ngoodbye world\nhello again' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('hello');
    expect(result.output).not.toContain('goodbye');
  });

  it('respects timeouts', async () => {
    const result = await wasm('sleep', ['1'], { timeout: 10 }); // sleep 1s with 10ms timeout
    expect(result.success).toBe(false);
  });

  it('executes pipeline', async () => {
    const result = await pipeline([
      { cmd: 'echo', args: ['target_line\nother_line'] },
      { cmd: 'grep', args: ['target'] },
    ]);

    expect(result.success).toBe(true);
    expect(result.output).toContain('target_line');
    expect(result.output).not.toContain('other_line');
  });

  it('stops pipeline on failure', async () => {
    const result = await pipeline([
      { cmd: 'echo', args: ['test'] },
      // @ts-expect-error Testing with invalid command that will fail
      { cmd: 'invalid_command_that_fails', args: [] },
    ]);

    expect(result.success).toBe(false);
  });
});

describe('WASM_COMMANDS', () => {
  it('contains expected commands', () => {
    expect(WASM_COMMANDS).toContain('cat');
    expect(WASM_COMMANDS).toContain('grep');
    expect(WASM_COMMANDS).toContain('sed');
    expect(WASM_COMMANDS).toContain('find');
    expect(WASM_COMMANDS).toContain('jq');
  });
});
