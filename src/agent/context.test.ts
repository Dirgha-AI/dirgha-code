/**
 * agent/context.test.ts — Context building tests
 */
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, estimateTokens, formatToolResult, truncateToFit } from './context.js';

describe('estimateTokens', () => {
  it('estimates tokens for text', () => {
    const text = 'Hello world this is a test';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    // Roughly 1 token per ~4 characters for English
    expect(tokens).toBeGreaterThanOrEqual(5);
  });

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('handles long text', () => {
    const longText = 'word '.repeat(1000);
    const tokens = estimateTokens(longText);
    expect(tokens).toBeGreaterThan(200);
  });
});

describe('formatToolResult', () => {
  it('formats successful result', () => {
    const result = formatToolResult({
      toolCallId: 'call_1',
      content: 'File contents',
      isError: false
    });
    
    expect(result).toContain('call_1');
    expect(result).toContain('File contents');
  });

  it('formats error result', () => {
    const result = formatToolResult({
      toolCallId: 'call_2',
      content: 'File not found',
      isError: true
    });
    
    expect(result).toContain('ERROR');
    expect(result).toContain('call_2');
  });

  it('truncates long results', () => {
    const longContent = 'a'.repeat(10000);
    const result = formatToolResult({
      toolCallId: 'call_3',
      content: longContent,
      isError: false
    });
    
    expect(result.length).toBeLessThan(longContent.length + 100);
    expect(result).toContain('...');
  });
});

describe('truncateToFit', () => {
  it('returns short context unchanged', () => {
    const short = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there' }
    ];
    
    const truncated = truncateToFit(short, 10000);
    expect(truncated).toEqual(short);
  });

  it('truncates when context exceeds limit', () => {
    const longContext = [
      { role: 'system' as const, content: 'System prompt' },
      ...Array(100).fill({ role: 'user' as const, content: 'Long message content that takes up tokens ' + 'word '.repeat(50) })
    ];
    
    const truncated = truncateToFit(longContext, 4000);
    expect(truncated.length).toBeLessThan(longContext.length);
    // System message should be preserved
    const systemMsg = truncated.find(m => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg?.content).toBe('System prompt');
  });
});

describe('buildSystemPrompt', () => {
  it('returns a system prompt', async () => {
    const prompt = await buildSystemPrompt('/test/project');
    
    expect(prompt).toContain('Dirgha');
    expect(prompt).toContain('Project');
  });

  it('includes working directory', async () => {
    const prompt = await buildSystemPrompt('/test');
    
    expect(prompt).toContain('Working directory');
  });
});
