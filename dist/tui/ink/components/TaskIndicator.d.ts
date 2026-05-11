/**
 * TaskIndicator — Persistent task status panel for the TUI.
 *
 * Reads ~/.dirgha/tasks.json and shows active (non-done, non-cancelled)
 * tasks with progress bars. Sits above the PromptQueueIndicator.
 *
 * Polls the file every 2s so agent-side task_create/task_update calls
 * appear live in the UI without requiring a full re-render pipeline.
 */
import * as React from "react";
export declare function TaskIndicator(): React.JSX.Element | null;
