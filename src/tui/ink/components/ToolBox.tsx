/**
 * Tool invocation block.
 *
 * Consumes the state that App derives from tool_exec_start and
 * tool_exec_end events. While a tool is in flight we render a spinner;
 * on completion we show ✓ or ✗ plus the elapsed time and a short
 * output preview. No state is owned here — App is the source of truth
 * so history stays immutable after scroll-off.
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import { iconFor } from '../icons.js';
import { useTheme } from '../theme-context.js';

export type ToolStatus = 'running' | 'done' | 'error';

export interface ToolBoxProps {
  name: string;
  status: ToolStatus;
  argSummary?: string;
  outputPreview?: string;
  durationMs?: number;
  startedAt: number;
}

const SPINNER_FRAMES: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const TOOL_LABEL: Record<string, string> = {
  fs_read: 'Read',
  fs_write: 'Write',
  fs_edit: 'Edit',
  fs_ls: 'List',
  search_grep: 'Grep',
  search_glob: 'Glob',
  shell: 'Shell',
  git: 'Git',
  task: 'Task',
};

function prettyName(name: string): string {
  return TOOL_LABEL[name] ?? name.replace(/_/g, ' ');
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function ToolBox(props: ToolBoxProps): React.JSX.Element {
  const palette = useTheme();
  const [frame, setFrame] = React.useState(0);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (props.status !== 'running') return;
    const t = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
      setTick(n => n + 1);
    }, 80);
    return (): void => clearInterval(t);
  }, [props.status]);

  const icon = props.status === 'error' ? '✗' : props.status === 'done' ? '✓' : SPINNER_FRAMES[frame];
  const iconColour = props.status === 'error' ? palette.error : props.status === 'done' ? palette.brand : palette.brand;
  const borderColour = props.status === 'error' ? palette.error : props.status === 'done' ? palette.borderIdle : palette.brand;

  const elapsedLabel = props.status === 'running'
    ? formatElapsed(Date.now() - props.startedAt)
    : props.durationMs !== undefined
      ? formatElapsed(props.durationMs)
      : '';
  // tick is read so React treats it as a live dep; silences unused var lints.
  void tick;

  const preview = props.outputPreview
    ? props.outputPreview.replace(/\s+/g, ' ').slice(0, 80)
    : '';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColour} paddingX={1} marginBottom={1}>
      <Box gap={1}>
        <Text color={iconColour}>{icon}</Text>
        <Text color={palette.accent} bold>{iconFor(props.name)}</Text>
        <Text color={props.status === 'done' ? palette.textMuted : palette.textPrimary} bold>{prettyName(props.name)}</Text>
        {props.argSummary !== undefined && props.argSummary.length > 0 && (
          <Text color={palette.textMuted} dimColor>({props.argSummary})</Text>
        )}
        {elapsedLabel !== '' && <Text color={palette.textMuted} dimColor>{elapsedLabel}</Text>}
      </Box>
      {preview !== '' && (
        <Box>
          <Text color={palette.textMuted} dimColor>{preview}</Text>
        </Box>
      )}
    </Box>
  );
}
