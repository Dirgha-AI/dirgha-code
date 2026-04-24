import { describe, it, expect } from 'vitest';
import { normaliseOpenAI } from './normalise.js';

describe('normaliseOpenAI', () => {
  it('extracts a plain text message', () => {
    const input = {
      choices: [{ message: { role: 'assistant', content: 'hello world' } }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    };
    const out = normaliseOpenAI(input);
    expect(out.content).toEqual([{ type: 'text', text: 'hello world' }]);
    expect(out.usage).toEqual({ input_tokens: 10, output_tokens: 3 });
  });

  it('handles empty content with tool calls', () => {
    const input = {
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_1',
            function: { name: 'read_file', arguments: '{"path":"foo.txt"}' },
          }],
        },
      }],
    };
    const out = normaliseOpenAI(input);
    expect(out.content).toHaveLength(1);
    expect(out.content[0]).toMatchObject({
      type: 'tool_use', id: 'call_1', name: 'read_file',
      input: { path: 'foo.txt' },
    });
  });

  it('handles text + tool calls together', () => {
    const input = {
      choices: [{
        message: {
          role: 'assistant',
          content: "I'll read the file",
          tool_calls: [{
            id: 'call_2',
            function: { name: 'read_file', arguments: '{"path":"a"}' },
          }],
        },
      }],
    };
    const out = normaliseOpenAI(input);
    expect(out.content).toHaveLength(2);
    expect(out.content[0]).toMatchObject({ type: 'text' });
    expect(out.content[1]).toMatchObject({ type: 'tool_use' });
  });

  it('tolerates malformed JSON in tool arguments (empty input)', () => {
    const input = {
      choices: [{
        message: {
          role: 'assistant',
          tool_calls: [{
            id: 'call_3',
            function: { name: 'tool', arguments: 'not-json' },
          }],
        },
      }],
    };
    const out = normaliseOpenAI(input);
    expect(out.content[0]).toMatchObject({ type: 'tool_use', input: {} });
  });

  it('handles missing usage', () => {
    const input = {
      choices: [{ message: { role: 'assistant', content: 'hi' } }],
    };
    expect(normaliseOpenAI(input).usage).toBeUndefined();
  });

  it('throws on invalid response (no choices[0].message)', () => {
    expect(() => normaliseOpenAI({})).toThrow(/Invalid OpenAI response/);
    expect(() => normaliseOpenAI({ choices: [] })).toThrow(/Invalid OpenAI response/);
    expect(() => normaliseOpenAI({ choices: [{}] })).toThrow(/Invalid OpenAI response/);
  });

  it('handles empty tool_calls array', () => {
    const input = {
      choices: [{
        message: { role: 'assistant', content: 'text', tool_calls: [] },
      }],
    };
    const out = normaliseOpenAI(input);
    expect(out.content).toEqual([{ type: 'text', text: 'text' }]);
  });

  it('handles multiple tool calls', () => {
    const input = {
      choices: [{
        message: {
          role: 'assistant',
          tool_calls: [
            { id: 'c1', function: { name: 'read_file', arguments: '{"path":"a"}' } },
            { id: 'c2', function: { name: 'write_file', arguments: '{"path":"b","content":"x"}' } },
          ],
        },
      }],
    };
    const out = normaliseOpenAI(input);
    expect(out.content).toHaveLength(2);
    expect(out.content.map((c: any) => c.id)).toEqual(['c1', 'c2']);
  });

  it('treats empty string content as absent (tool-only response)', () => {
    const input = {
      choices: [{
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'x', function: { name: 'ask_user', arguments: '{}' } }],
        },
      }],
    };
    const out = normaliseOpenAI(input);
    expect(out.content).toHaveLength(1);
    expect(out.content[0]?.type).toBe('tool_use');
  });

  it('defaults token counts to 0 when usage is partial', () => {
    const input = {
      choices: [{ message: { role: 'assistant', content: 'hi' } }],
      usage: { prompt_tokens: 5 }, // no completion_tokens
    };
    const out = normaliseOpenAI(input);
    expect(out.usage).toEqual({ input_tokens: 5, output_tokens: 0 });
  });
});
