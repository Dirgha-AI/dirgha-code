/**
 * providers/messages.ts — Message format conversion
 *
 * Internal canonical format: Anthropic (most expressive).
 * OpenAI-compat providers (Fireworks, OpenRouter, NVIDIA, LiteLLM, Dirgha, OpenAI)
 * call toOpenAIMessages() before sending.
 *
 * Anthropic assistant tool_use:
 *   { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] }
 * Anthropic tool result:
 *   { role: 'user', content: [{ type: 'tool_result', tool_use_id, content }] }
 *
 * OpenAI assistant tool_calls:
 *   { role: 'assistant', tool_calls: [{ id, type:'function', function:{name, arguments} }] }
 * OpenAI tool result:
 *   { role: 'tool', tool_call_id, content }
 */
import type { Message } from '../types.js';

export function toOpenAIMessages(messages: Message[], systemPrompt: string): any[] {
  const out: any[] = [{ role: 'system', content: systemPrompt }];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        out.push({ role: 'assistant', content: msg.content });
        continue;
      }
      const blocks = msg.content as any[];
      const textBlocks  = blocks.filter(b => b.type === 'text');
      const toolUseBlocks = blocks.filter(b => b.type === 'tool_use');
      if (toolUseBlocks.length > 0) {
        out.push({
          role: 'assistant',
          content: textBlocks.length ? textBlocks.map(b => b.text).join('') : null,
          tool_calls: toolUseBlocks.map(b => ({
            id: b.id,
            type: 'function',
            function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
          })),
        });
      } else {
        out.push({ role: 'assistant', content: textBlocks.map(b => b.text).join('') });
      }
      continue;
    }

    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        out.push({ role: 'user', content: msg.content });
        continue;
      }
      const blocks = msg.content as any[];
      const toolResults = blocks.filter(b => b.type === 'tool_result');
      if (toolResults.length > 0) {
        // Each tool_result → separate OpenAI 'tool' message
        // Flatten array content to text since most OpenAI-compat APIs don't support
        // multi-modal content in the 'tool' role.
        for (const tr of toolResults) {
          let content: string;
          if (Array.isArray(tr.content)) {
            content = tr.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
          } else {
            content = String(tr.content ?? '');
          }
          out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content });
        }
      } else {
        const hasImages = blocks.some(b => b.type === 'image');
        if (hasImages) {
          const parts: any[] = [];
          for (const b of blocks) {
            if (b.type === 'text') {
              parts.push({ type: 'text', text: b.text });
            } else if (b.type === 'image' && b.image) {
              parts.push({ type: 'image_url', image_url: { url: `data:image/${b.image.format};base64,${b.image.data}` } });
            }
          }
          out.push({ role: 'user', content: parts });
        } else {
          const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
          out.push({ role: 'user', content: text });
        }
      }
      continue;
    }
    // Skip system/tool roles — handled above or irrelevant
  }

  return out;
}

/** Convert Gemini-specific message format (uses 'model' role instead of 'assistant') */
export function toGeminiMessages(messages: Message[]): any[] {
  const out: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        out.push({ role: 'model', parts: [{ text: msg.content }] });
        continue;
      }
      const blocks = msg.content as any[];
      const textBlocks = blocks.filter(b => b.type === 'text');
      const toolUseBlocks = blocks.filter(b => b.type === 'tool_use');
      const parts: any[] = textBlocks.map(b => ({ text: b.text }));
      for (const tu of toolUseBlocks) {
        parts.push({ functionCall: { name: tu.name, args: tu.input ?? {} } });
      }
      out.push({ role: 'model', parts });
      continue;
    }

    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        out.push({ role: 'user', parts: [{ text: msg.content }] });
        continue;
      }
      const blocks = msg.content as any[];
      const toolResults = blocks.filter(b => b.type === 'tool_result');
      if (toolResults.length > 0) {
        const parts = toolResults.map(tr => ({
          functionResponse: { name: tr.name ?? tr.tool_use_id, response: { content: tr.content ?? '' } },
        }));
        out.push({ role: 'user', parts });
      } else {
        const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
        out.push({ role: 'user', parts: [{ text }] });
      }
      continue;
    }
  }

  return out;
}
