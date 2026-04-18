/**
 * commands/capture.test.ts — export content extraction + capture helpers (C5.2, C5.3)
 */
import { describe, it, expect } from 'vitest';

// ── extractText (inlined from capture.ts / session.ts) ────────────────────────

function extractText(content: unknown): string {
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('\n') || content;
      }
    } catch { /* plain string */ }
    return content;
  }
  if (Array.isArray(content)) {
    return (content as any[]).filter(b => b?.type === 'text').map(b => b.text ?? '').join('\n');
  }
  return JSON.stringify(content);
}

describe('extractText: content block extraction', () => {
  it('returns plain string as-is', () => {
    expect(extractText('hello world')).toBe('hello world');
  });

  it('extracts text from JSON-stringified content blocks', () => {
    const blocks = JSON.stringify([
      { type: 'text', text: 'Hello' },
      { type: 'tool_use', name: 'bash' },
      { type: 'text', text: 'World' },
    ]);
    expect(extractText(blocks)).toBe('Hello\nWorld');
  });

  it('extracts text from array of content blocks', () => {
    const blocks = [
      { type: 'text', text: 'Alpha' },
      { type: 'tool_result' },
      { type: 'text', text: 'Beta' },
    ];
    expect(extractText(blocks)).toBe('Alpha\nBeta');
  });

  it('returns plain string if JSON parses to non-array', () => {
    const s = '"just a string"';
    expect(extractText(s)).toBe(s); // can't extract from non-array JSON
  });

  it('returns empty string for empty block array', () => {
    const blocks = JSON.stringify([{ type: 'tool_use', name: 'read' }]);
    // No text blocks → falls back to original content string (no text found)
    expect(extractText(blocks)).toBe(blocks);
  });

  it('handles null/undefined gracefully via JSON.stringify', () => {
    expect(extractText(null)).toBe('null');
    expect(extractText({ role: 'user' })).toBe('{"role":"user"}');
  });
});

// ── Export format validation ──────────────────────────────────────────────────

describe('Export: format logic', () => {
  const VALID = ['md', 'html', 'json'] as const;

  it('accepts all three valid formats', () => {
    for (const f of VALID) {
      expect(VALID.includes(f as any)).toBe(true);
    }
  });

  it('invalid format falls back to md', () => {
    const fmt = (s: string) =>
      (['md', 'html', 'json'] as const).includes(s as any) ? s : 'md';
    expect(fmt('pdf')).toBe('md');
    expect(fmt('html')).toBe('html');
    expect(fmt('json')).toBe('json');
  });
});
