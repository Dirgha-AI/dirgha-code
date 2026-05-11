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
import { Box, Text } from "ink";
import { useTheme } from "../theme-context.js";
import { listTasks, type Task } from "../../../context/tasks.js";

const POLL_MS = 2_000;
const MAX_VISIBLE = 5;

export function TaskIndicator(): React.JSX.Element | null {
  const palette = useTheme();
  const [tasks, setTasks] = React.useState<Task[]>([]);

  React.useEffect(() => {
    function poll() {
      listTasks()
        .then((all) => {
          // Show only active (non-terminal) tasks
          const active = all.filter(
            (t) => t.status !== "done" && t.status !== "cancelled",
          );
          setTasks(active);
        })
        .catch(() => {});
    }
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => clearInterval(iv);
  }, []);

  if (tasks.length === 0) return null;

  const visible = tasks.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, tasks.length - MAX_VISIBLE);

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={0}>
      <Text color={palette.text.primary} bold>
        Tasks ({tasks.length} active)
      </Text>
      {visible.map((t) => (
        <TaskRow key={t.id} task={t} palette={palette} />
      ))}
      {overflow > 0 && (
        <Text color={palette.textMuted} dimColor>
          {"  "}+{overflow} more
        </Text>
      )}
    </Box>
  );
}

function TaskRow({
  task,
  palette,
}: {
  task: Task;
  palette: ReturnType<typeof useTheme>;
}): React.JSX.Element {
  const icon =
    task.status === "in_progress"
      ? "🔄"
      : task.status === "blocked"
        ? "🚫"
        : "⏳";
  const label = `${icon} [${task.id.slice(0, 8)}] ${task.title}`;

  // Show a simple progress bar for in_progress tasks
  const hasProgress = task.status === "in_progress" && task.progress !== undefined;

  return (
    <Box flexDirection="column">
      <Text color={palette.text.primary}>
        {"  "}{label}
      </Text>
      {hasProgress && (
        <Box marginLeft={4}>
          <ProgressBar value={task.progress!} palette={palette} />
        </Box>
      )}
    </Box>
  );
}

function ProgressBar({
  value,
  palette,
}: {
  value: number;
  palette: ReturnType<typeof useTheme>;
}): React.JSX.Element {
  const barW = 20;
  const filled = Math.round((value / 100) * barW);
  const empty = barW - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return (
    <Text>
      {bar} {value}%
    </Text>
  );
}
