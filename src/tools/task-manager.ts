/**
 * task-manager.ts — Persistent task/todo tools for the agent.
 *
 * The agent can create, update, list, and delete tasks. Each task has
 * a title, status (pending/in_progress/done/blocked/cancelled), progress
 * percentage, priority, project, and tags. Stored in ~/.dirgha/tasks.json.
 *
 * The TUI's TaskIndicator reads the same file so the user sees live status.
 */

import type { Tool, ToolContext } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";
import {
  createTask,
  updateTask,
  listTasks,
  deleteTask,
  getTask,
  taskSummary,
  type TaskStatus,
} from "../context/tasks.js";

const VALID_STATUS: TaskStatus[] = ["pending", "in_progress", "done", "blocked", "cancelled"];

export const taskCreateTool: Tool = {
  name: "task_create",
  description: "Create a new persistent task. The task appears in the TUI task panel. Use this for multi-step goals that need tracking.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short task title (required)." },
      description: { type: "string", description: "Optional longer description." },
      priority: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Default: medium." },
      project: { type: "string", description: "Project name for grouping." },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags." },
    },
    required: ["title"],
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as {
      title: string;
      description?: string;
      priority?: string;
      project?: string;
      tags?: string[];
    };
    const task = await createTask({
      title: input.title,
      description: input.description,
      priority: (input.priority as any) ?? "medium",
      project: input.project,
      tags: input.tags,
    });
    return {
      isError: false,
      content: `✅ Task created: ${task.id} — "${task.title}"`,
      metadata: { taskId: task.id, task },
    };
  },
};

export const taskUpdateTool: Tool = {
  name: "task_update",
  description: "Update a task's status, progress, or other fields. Use this when you make progress on a tracked task.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Task ID (required)." },
      status: { type: "string", enum: VALID_STATUS, description: "New status." },
      progress: { type: "integer", minimum: 0, maximum: 100, description: "Progress percentage 0-100." },
      title: { type: "string" },
      description: { type: "string" },
    },
    required: ["id"],
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as {
      id: string;
      status?: string;
      progress?: number;
      title?: string;
      description?: string;
    };
    const changes: Record<string, unknown> = {};
    if (input.status) changes.status = input.status;
    if (input.progress !== undefined) changes.progress = input.progress;
    if (input.title) changes.title = input.title;
    if (input.description !== undefined) changes.description = input.description;

    const updated = await updateTask(input.id, changes as any);
    if (!updated) return { content: `❌ Task "${input.id}" not found.`, isError: true };
    return {
      isError: false,
      content: `✅ Task ${input.id}: ${updated.status}${updated.progress !== undefined ? ` (${updated.progress}%)` : ""}`,
      metadata: { task: updated },
    };
  },
};

export const taskListTool: Tool = {
  name: "task_list",
  description: "List all tasks, optionally filtered by status.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: VALID_STATUS, description: "Filter by status." },
    },
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as { status?: string };
    const tasks = await listTasks(input.status as any);
    if (tasks.length === 0) return { isError: false, content: "No tasks found." };
    const lines = tasks.map((t) => {
      const icon = t.status === "done" ? "✅" : t.status === "in_progress" ? "🔄" : t.status === "blocked" ? "🚫" : t.status === "cancelled" ? "❌" : "⏳";
      const pct = t.progress !== undefined ? ` ${t.progress}%` : "";
      return `${icon} [${t.id}] ${t.title}${pct} (${t.status})`;
    });
    return { isError: false, content: `Tasks (${tasks.length}):\n${lines.join("\n")}` };
  },
};

export const taskDeleteTool: Tool = {
  name: "task_delete",
  description: "Delete a task permanently.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Task ID to delete." },
    },
    required: ["id"],
  },
  async execute(rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = rawInput as { id: string };
    const ok = await deleteTask(input.id);
    return { isError: !ok, content: ok ? `✅ Task "${input.id}" deleted.` : `❌ Task "${input.id}" not found.` };
  },
};

export const taskSummaryTool: Tool = {
  name: "task_summary",
  description: "Get a summary of all tasks (counts by status).",
  inputSchema: { type: "object", properties: {} },
  async execute(_rawInput: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const s = await taskSummary();
    return {
      isError: false,
      content: `Tasks: ${s.total} total · ${s.pending} pending · ${s.inProgress} in progress · ${s.done} done · ${s.blocked} blocked`,
      metadata: s,
    };
  },
};
