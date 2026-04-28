/**
 * Renders the pending prompt queue above the InputBox.
 *
 * While a turn is running the user can keep typing — submissions land
 * in App's `promptQueue` state and get drained FIFO when the active
 * turn finishes. Showing the queue makes that contract visible: the
 * user sees that their messages are *not* lost and *not* interleaved.
 *
 * Compact by design: max 3 lines (older items collapse into "+N more").
 * Renders nothing when the queue is empty.
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme-context.js';

interface Props {
  queued: string[];
}

const MAX_VISIBLE = 3;
const TRUNCATE_AT = 80;

export function PromptQueueIndicator(props: Props): React.JSX.Element | null {
  const palette = useTheme();
  if (props.queued.length === 0) return null;

  const visible = props.queued.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, props.queued.length - MAX_VISIBLE);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={palette.textMuted}>
        queued ({props.queued.length}) — runs after current turn
      </Text>
      {visible.map((p, i) => (
        <Text key={i} color={palette.textMuted}>
          {'  '}• {truncate(p)}
        </Text>
      ))}
      {overflow > 0 && (
        <Text color={palette.textMuted} dimColor>
          {'  '}+{overflow} more
        </Text>
      )}
    </Box>
  );
}

function truncate(s: string): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length <= TRUNCATE_AT ? flat : `${flat.slice(0, TRUNCATE_AT - 1)}…`;
}
