/**
 * tasks.ts — Persistent task/todo store at ~/.dirgha/tasks.json
 *
 * Mirrors the memory/ledger/credentials pattern: atomic tmp+rename JSON.
 * Tasks survive restarts and are visible in the TUI.
 */
export type TaskStatus = "pending" | "in_progress" | "done" | "blocked" | "cancelled";
export interface Task {
    id: string;
    title: string;
    description?: string;
    status: TaskStatus;
    priority?: "low" | "medium" | "high" | "critical";
    progress?: number;
    project?: string;
    tags?: string[];
    created: string;
    updated: string;
}
export declare function taskId(): string;
export declare function listTasks(status?: TaskStatus): Promise<Task[]>;
export declare function getTask(id: string): Promise<Task | null>;
export declare function createTask(opts: {
    title: string;
    description?: string;
    priority?: Task["priority"];
    project?: string;
    tags?: string[];
}): Promise<Task>;
export declare function updateTask(id: string, changes: Partial<Pick<Task, "status" | "progress" | "title" | "description" | "priority" | "project" | "tags">>): Promise<Task | null>;
export declare function deleteTask(id: string): Promise<boolean>;
/** Return summary counts for the TUI */
export declare function taskSummary(): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    done: number;
    blocked: number;
}>;
