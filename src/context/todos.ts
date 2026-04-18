/**
 * todos.ts — Session TODO list helpers
 */
import type { ReplContext, TodoItem } from '../types.js';

export function addTodo(ctx: ReplContext, text: string): TodoItem {
  const item: TodoItem = {
    id: String(ctx.todos.length + 1),
    text,
    done: false,
    createdAt: new Date().toISOString(),
  };
  ctx.todos.push(item);
  return item;
}

export function completeTodo(ctx: ReplContext, id: string): boolean {
  const item = ctx.todos.find(t => t.id === id);
  if (!item) return false;
  item.done = true;
  return true;
}

export function pendingTodos(ctx: ReplContext): TodoItem[] {
  return ctx.todos.filter(t => !t.done);
}
