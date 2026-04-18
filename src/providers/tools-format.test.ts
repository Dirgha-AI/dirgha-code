/**
 * providers/tools-format.test.ts — Tool format conversion tests
 */
import { describe, it, expect } from 'vitest';
import { toOpenAITools } from './tools-format.js';

describe('toOpenAITools', () => {
  it('converts all tool definitions to OpenAI format', () => {
    const converted = toOpenAITools();
    
    expect(converted.length).toBeGreaterThan(0);
    expect(converted[0]).toHaveProperty('type', 'function');
    expect(converted[0]).toHaveProperty('function.name');
    expect(converted[0]).toHaveProperty('function.description');
    expect(converted[0]).toHaveProperty('function.parameters');
  });

  it('includes expected tools', () => {
    const converted = toOpenAITools();
    const toolNames = converted.map(t => t.function.name);
    
    // Should have core tools from TOOL_DEFINITIONS
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('write_file');
    expect(toolNames).toContain('list_files');
    expect(toolNames).toContain('search_files');
  });

  it('validates tool structure', () => {
    const converted = toOpenAITools();
    
    for (const tool of converted) {
      expect(tool.type).toBe('function');
      expect(typeof tool.function.name).toBe('string');
      expect(typeof tool.function.description).toBe('string');
      expect(tool.function.parameters).toHaveProperty('type');
    }
  });
});
