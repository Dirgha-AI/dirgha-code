/** tools/memory.ts — Memory + todos + ask_user tools */
import { appendMemory, readMemory } from '../session/memory.js';
import { promptUserInput } from '../permission/confirmation.js';
import type { ToolResult, ReplContext } from '../types.js';

export async function saveMemoryTool(input: Record<string, any>): Promise<ToolResult> {
  try {
    appendMemory(input['text'] as string);
    return { tool: 'save_memory', result: 'Saved to memory.' };
  } catch (e) { return { tool: 'save_memory', result: '', error: (e as Error).message }; }
}

export function readMemoryTool(): ToolResult {
  try {
    const mem = readMemory();
    return { tool: 'read_memory', result: mem ? mem.slice(0, 8000) : '(no memory saved yet)' };
  } catch (e) { return { tool: 'read_memory', result: '', error: (e as Error).message }; }
}

export function writeTodosTool(input: Record<string, any>, ctx?: ReplContext): ToolResult {
  try {
    const todos = input['todos'] as Array<{ id: string; text: string; done: boolean }>;
    if (!Array.isArray(todos)) return { tool: 'write_todos', result: '', error: 'todos must be an array' };
    const items = todos.map((t, i) => ({ id: t.id || String(i + 1), text: t.text, done: t.done ?? false, createdAt: new Date().toISOString() }));
    if (ctx) ctx.todos.splice(0, ctx.todos.length, ...items);
    return { tool: 'write_todos', result: `Updated ${items.length} TODO items.` };
  } catch (e) { return { tool: 'write_todos', result: '', error: (e as Error).message }; }
}

export async function askUserTool(input: Record<string, any>): Promise<ToolResult> {
  try {
    const question = input['question'] as string;
    const choices = input['choices'] as string[] | undefined;
    let prompt = question;
    if (choices?.length) {
      prompt += '\n' + choices.map((c, i) => `  ${i + 1}. ${c}`).join('\n');
    }
    const answer = await promptUserInput(prompt);
    if (choices?.length) {
      const idx = parseInt(answer) - 1;
      return { tool: 'ask_user', result: (!isNaN(idx) && idx >= 0 && idx < choices.length ? choices[idx] : answer)! };
    }
    return { tool: 'ask_user', result: answer };
  } catch (e) { return { tool: 'ask_user', result: '', error: (e as Error).message }; }
}
