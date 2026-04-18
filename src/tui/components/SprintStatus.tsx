import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { SprintJournal } from '../../sprint/journal.js';
import type { SprintProgress, TaskStateRow } from '../../sprint/types.js';

interface SprintStatusProps {
  sprintId: string;
}

const formatElapsed = (ms: number): string => {
  if (!ms || ms < 0) return '0h 0m';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};

const getTaskIcon = (status: string): string => {
  switch (status) {
    case 'completed': return '∎';
    case 'failed': return '✗';
    case 'running': return '∿';
    case 'pending': return '○';
    case 'skipped': return '⊘';
    case 'paused': return '‖';
    default: return '○';
  }
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'completed': return 'green';
    case 'running': return 'yellow';
    case 'failed': return 'red';
    case 'pending': return 'gray';
    case 'paused': return 'cyan';
    case 'skipped': return 'dim';
    default: return 'white';
  }
};

const SprintStatus: React.FC<SprintStatusProps> = ({ sprintId }) => {
  const { exit } = useApp();
  const [progress, setProgress] = useState<SprintProgress | null>(null);
  const [showPauseHelp, setShowPauseHelp] = useState(false);

  useEffect(() => {
    const journal = new SprintJournal(sprintId);
    
    const fetchProgress = () => {
      try {
        const data = journal.getProgress();
        setProgress(data);
      } catch (error) {
        // Silently handle polling errors
      }
    };

    fetchProgress();
    const interval = setInterval(fetchProgress, 2000);

    return () => clearInterval(interval);
  }, [sprintId]);

  useInput((input) => {
    if (input === 'q' || input === 'Q') {
      exit();
    }
    if (input === 'p' || input === 'P') {
      setShowPauseHelp(true);
      setTimeout(() => setShowPauseHelp(false), 3000);
    }
  });

  if (!progress) {
    return (
      <Box>
        <Text>Loading sprint {sprintId}...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text>
          Sprint: <Text bold>{sprintId}</Text> | Goal: <Text bold>{progress.goal}</Text>
        </Text>
      </Box>

      <Box>
        <Text>
          Status: <Text color={getStatusColor(progress.status)}>{progress.status}</Text> | Elapsed: {formatElapsed(progress.elapsedMs)}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Box width={40}>
            <Text bold>Task</Text>
          </Box>
          <Box width={12}>
            <Text bold>Status</Text>
          </Box>
          <Box width={12}>
            <Text bold>Time</Text>
          </Box>
          <Box width={8}>
            <Text bold>Retries</Text>
          </Box>
        </Box>

        {progress.tasks?.map((task: TaskStateRow) => (
          <Box key={task.taskId}>
            <Box width={40}>
              <Text>
                <Text color={getStatusColor(task.status)}>{getTaskIcon(task.status)}</Text> {task.taskId} 
              </Text>
            </Box>
            <Box width={12}>
              <Text color={getStatusColor(task.status)}>{task.status}</Text>
            </Box>
            <Box width={12}>
              <Text>{formatElapsed(task.startedAt ? Date.now() - new Date(task.startedAt).getTime() : 0)}</Text>
            </Box>
            <Box width={8}>
              <Text>{task.attempts}</Text>
            </Box>
          </Box>
        ))}
      </Box>

      {showPauseHelp && (
        <Box marginTop={1}>
          <Text color="cyan">Press [P] to pause/resume the sprint execution</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>[P] Pause instructions | [Q] Quit view</Text>
      </Box>
    </Box>
  );
};

export default SprintStatus;
