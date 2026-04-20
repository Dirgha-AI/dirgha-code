import * as React from 'react';
import { TaskQueue, type QueuedTask, initTaskQueue } from './TaskQueue.js';

/**
 * useAppTaskQueue — Hook to manage the parallel task queue.
 */
export function useAppTaskQueue(processTask: (task: QueuedTask) => Promise<void>) {
  const [taskQueue, setTaskQueue] = React.useState<TaskQueue | null>(null);
  const [queuedTasks, setQueuedTasks] = React.useState<QueuedTask[]>([]);
  const [currentTasks, setCurrentTasks] = React.useState<QueuedTask[]>([]);
  const [queueStatus, setQueueStatus] = React.useState({ pending: 0, running: 0 });
  
  const processTaskRef = React.useRef(processTask);
  React.useEffect(() => { processTaskRef.current = processTask; }, [processTask]);

  React.useEffect(() => {
    const queue = initTaskQueue(
      async (task) => await processTaskRef.current(task),
      (tasks, current) => {
        setQueuedTasks(tasks);
        setCurrentTasks(current ? [current] : []);
        setQueueStatus({
          pending: tasks.filter(t => t.status === 'pending').length,
          running: current ? 1 : 0,
        });
      }
    );
    setTaskQueue(queue);
  }, []);

  return { taskQueue, queuedTasks, currentTasks, queueStatus };
}
