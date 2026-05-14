import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { distillToolResult } from '../distill.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('distillToolResult', () => {
  let tmpDir: string;
  let originalDirghaToolOutputsDir: string | undefined;
  let originalDirghaToolDistillDisable: string | undefined;
  let originalDirghaToolDistillMaxChars: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dirgha-distill-test-'));
    originalDirghaToolOutputsDir = process.env.DIRGHA_TOOL_OUTPUTS_DIR;
    originalDirghaToolDistillDisable = process.env.DIRGHA_TOOL_DISTILL_DISABLE;
    originalDirghaToolDistillMaxChars = process.env.DIRGHA_TOOL_DISTILL_MAX_CHARS;
    process.env.DIRGHA_TOOL_OUTPUTS_DIR = tmpDir;
  });

  afterEach(() => {
    if (originalDirghaToolOutputsDir !== undefined) {
      process.env.DIRGHA_TOOL_OUTPUTS_DIR = originalDirghaToolOutputsDir;
    } else {
      delete process.env.DIRGHA_TOOL_OUTPUTS_DIR;
    }
    if (originalDirghaToolDistillDisable !== undefined) {
      process.env.DIRGHA_TOOL_DISTILL_DISABLE = originalDirghaToolDistillDisable;
    } else {
      delete process.env.DIRGHA_TOOL_DISTILL_DISABLE;
    }
    if (originalDirghaToolDistillMaxChars !== undefined) {
      process.env.DIRGHA_TOOL_DISTILL_MAX_CHARS = originalDirghaToolDistillMaxChars;
    } else {
      delete process.env.DIRGHA_TOOL_DISTILL_MAX_CHARS;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('T01: short_content_passes_through', () => {
    const content = 'A'.repeat(100);
    const result = { ok: true, content, isError: false };
    const distilled = distillToolResult(result);
    expect(distilled.content).toBe(content);
    expect(distilled.metadata).toBeUndefined();
  });

  it('T02: long_content_truncated_to_head_plus_tail', () => {
    const content = 'A'.repeat(25000);
    const result = { ok: true, content, isError: false };
    const distilled = distillToolResult(result);
    const headChars = 6000; // default headChars from impl
    const tailChars = 2000; // default tailChars from impl
    expect(distilled.content.length).toBeGreaterThanOrEqual(headChars + tailChars);
    expect(distilled.content.length).toBeLessThanOrEqual(headChars + tailChars + 200);
    expect(distilled.content.startsWith(content.slice(0, headChars))).toBe(true);
    expect(distilled.content.endsWith(content.slice(-tailChars))).toBe(true);
    expect(distilled.metadata?.distilled).toBe(true);
    expect(distilled.metadata?.originalLength).toBe(25000);
  });

  it('T03: truncated_marker_includes_savedPath', () => {
    const content = 'B'.repeat(25000);
    const result = { ok: true, content, isError: false };
    const distilled = distillToolResult(result);
    expect(distilled.content).toContain('saved to');
    expect(distilled.metadata?.fullOutputPath).toBeTruthy();
    expect(typeof distilled.metadata?.fullOutputPath).toBe('string');
    expect((distilled.metadata?.fullOutputPath as string).length).toBeGreaterThan(0);
  });

  it('T04: full_content_written_to_disk', () => {
    const content = 'C'.repeat(25000);
    const result = { ok: true, content, isError: false };
    const distilled = distillToolResult(result);
    const filePath = distilled.metadata?.fullOutputPath as string;
    expect(fs.existsSync(filePath)).toBe(true);
    const writtenContent = fs.readFileSync(filePath, 'utf-8');
    expect(writtenContent).toBe(content);
  });

  it('T05: disabled_via_env', () => {
    process.env.DIRGHA_TOOL_DISTILL_DISABLE = '1';
    const content = 'D'.repeat(100000);
    const result = { ok: true, content, isError: false };
    const distilled = distillToolResult(result);
    expect(distilled.content).toBe(content);
    expect(distilled.metadata?.distilled).toBeUndefined();
    // Verify no file written
    const files = fs.readdirSync(tmpDir);
    expect(files.length).toBe(0);
  });

  it('T06: custom_max_chars_via_env', () => {
    process.env.DIRGHA_TOOL_DISTILL_MAX_CHARS = '500';
    const content = 'E'.repeat(1000);
    const result = { ok: true, content, isError: false };
    const distilled = distillToolResult(result);
    // With maxChars=500, truncation should fire because content length > 500
    expect(distilled.content.length).toBeLessThan(1000);
    expect(distilled.content.length).toBeLessThanOrEqual(800); // head+tail+marker (path varies)
    expect(distilled.metadata?.distilled).toBe(true);
  });

  it('T07: ok_branch_preserved', () => {
    const content = 'F'.repeat(25000);
    const result = { ok: true, value: 'x', content, isError: false };
    const distilled = distillToolResult(result);
    expect(distilled.ok).toBe(true);
    expect(distilled.value).toBe('x');
  });

  it('T08: error_branch_preserved', () => {
    const content = 'G'.repeat(25000);
    const result = {
      ok: false,
      error: { kind: 'timeout' as const, message: 'timeout', retryable: false, fatal_to_loop: false },
      content,
      isError: true,
    };
    const distilled = distillToolResult(result);
    expect(distilled.ok).toBe(false);
    expect(distilled.error?.kind).toBe('timeout');
  });

  it('T09: non_string_content_left_alone', () => {
    const result = { ok: true, content: undefined, isError: false };
    const distilled = distillToolResult(result);
    expect(distilled.content).toBeUndefined();
    expect(distilled.metadata).toBeUndefined();
  });

  it('T10: sanitize_filename_strips_unsafe_chars', () => {
    const callId = "abc/def's ghi \"test\"";
    const content = 'H'.repeat(25000);
    const result = { ok: true, content, isError: false };
    const distilled = distillToolResult(result, callId);
    const filePath = distilled.metadata?.fullOutputPath as string;
    const basename = path.basename(filePath);
    // The filename (basename) should not contain unsafe chars from callId
    expect(basename).not.toContain('/');
    expect(basename).not.toContain("'");
    expect(basename).not.toContain('"');
    expect(basename).not.toContain(' ');
  });
});
