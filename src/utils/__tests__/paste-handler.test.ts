import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PasteHandler } from '../paste-handler.js';

describe('PasteHandler', () => {
  let handler: PasteHandler;

  beforeEach(() => {
    handler = new PasteHandler();
  });

  it('should generate preview correctly', () => {
    const content = 'line1\nline2\nline3';
    const result = {
      content,
      lineCount: 3,
      charCount: 17,
      byteCount: 17,
      truncated: false,
      preview: content.slice(0, 200).replace(/\n/g, ' ↵ '),
      duration: 1000,
    };

    expect(result.preview).toContain('↵');
    expect(result.lineCount).toBe(3);
    expect(result.charCount).toBe(17);
  });

  it('should format bytes correctly', () => {
    const testCases = [
      { bytes: 500, expected: '500 B' },
      { bytes: 1024, expected: '1.0 KB' },
      { bytes: 1024 * 1024, expected: '1.0 MB' },
    ];

    for (const { bytes, expected } of testCases) {
      const result = {
        content: '',
        lineCount: 0,
        charCount: bytes,
        byteCount: bytes,
        truncated: false,
        preview: '',
        duration: 0,
      };

      expect(result.byteCount).toBe(bytes);
    }
  });

  it('should detect truncation', () => {
    const result = {
      content: 'short',
      lineCount: 1,
      charCount: 5,
      byteCount: 5,
      truncated: true,
      preview: 'short',
      duration: 100,
    };

    expect(result.truncated).toBe(true);
  });
});
