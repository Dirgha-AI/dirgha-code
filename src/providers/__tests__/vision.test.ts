import { describe, it, expect, vi } from 'vitest';
import { toOpenAIMessages } from '../messages.js';
import type { Message } from '../../types.js';

describe('Vision & Multi-Modal Formatting', () => {
  it('should correctly format user messages with images for OpenAI/OpenRouter', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          { 
            type: 'image', 
            image: { format: 'png', data: 'base64data' } 
          }
        ]
      }
    ];

    const formatted = toOpenAIMessages(messages, 'system prompt');
    
    // index 0 is system, index 1 is our user message
    const userMsg = formatted[1];
    expect(userMsg.role).toBe('user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content).toHaveLength(2);
    expect(userMsg.content[0].type).toBe('text');
    expect(userMsg.content[1].type).toBe('image_url');
    expect(userMsg.content[1].image_url.url).toBe('data:image/png;base64,base64data');
  });

  it('should handle tool results with images by flattening to text for standard OpenAI tool role', () => {
    // Current implementation flattens tool results to text because many 
    // OpenAI-compatible APIs don't support multi-modal content in the 'tool' role yet.
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { 
            type: 'tool_result', 
            tool_use_id: 'call_1', 
            content: [
              { type: 'text', text: 'Screenshot results' },
              { type: 'image', image: { format: 'png', data: 'img_data' } }
            ] 
          }
        ]
      }
    ];

    const formatted = toOpenAIMessages(messages, 'system');
    const toolMsg = formatted[1];
    expect(toolMsg.role).toBe('tool');
    expect(typeof toolMsg.content).toBe('string');
    expect(toolMsg.content).toContain('Screenshot results');
  });
});
