/**
 * Inline tool-approval prompt — Ink-native.
 *
 * Replaces the legacy `createTuiApprovalBus` (in `tui/approval.ts`),
 * which wrote the approval question directly to `process.stdout` and
 * read `process.stdin` raw. That approach worked OK on Linux but on
 * Windows the raw-mode handoff between Ink and the approval reader
 * hung — and on every platform the prompt was invisible because Ink's
 * differential renderer overdrew it on the next frame.
 *
 * This component renders inside the React tree like `ModelSwitchPrompt`,
 * so it participates in normal Ink layout. Keys are read via `useInput`
 * (no raw-mode contention) and the answer is reported via `onResolve`.
 */

import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../theme-context.js';

export type ApprovalDecision = 'approve' | 'deny' | 'approve_once' | 'deny_always';

export interface ApprovalRequest {
  id: string;
  tool: string;
  summary: string;
  diff?: string;
}

export interface ApprovalPromptProps {
  request: ApprovalRequest;
  onResolve: (decision: ApprovalDecision) => void;
}

export function ApprovalPrompt(props: ApprovalPromptProps): React.JSX.Element {
  const palette = useTheme();
  const { request, onResolve } = props;

  useInput((ch, key) => {
    if (key.return) { onResolve('approve'); return; }            // default
    if (ch === 'y' || ch === 'Y') { onResolve('approve'); return; }
    if (ch === 'n' || ch === 'N') { onResolve('deny'); return; }
    if (ch === 'a' || ch === 'A') { onResolve('approve_once'); return; }
    if (ch === 'd' || ch === 'D') { onResolve('deny_always'); return; }
    if (key.escape) { onResolve('deny'); return; }
  }, { isActive: true });

  const diffLines = request.diff?.split('\n') ?? [];
  const previewLines = diffLines.slice(0, 12);
  const truncated = diffLines.length > 12;

  return (
    <Box marginY={1} paddingX={1} borderStyle="round" borderColor={palette.status.warning} flexDirection="column">
      <Box>
        <Text color={palette.status.warning} bold>⚠ </Text>
        <Text color={palette.text.primary}>
          {' '}Approve <Text bold>{request.tool}</Text>?
        </Text>
      </Box>
      {request.summary && (
        <Box paddingLeft={2}>
          <Text color={palette.text.secondary}>{request.summary}</Text>
        </Box>
      )}
      {previewLines.length > 0 && (
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          {previewLines.map((line, i) => (
            <Text key={i} color={
              line.startsWith('+') ? palette.status.success
              : line.startsWith('-') ? palette.status.error
              : palette.text.secondary
            }>{line}</Text>
          ))}
          {truncated && (
            <Text color={palette.text.secondary} dimColor>
              ⎿ ({diffLines.length - 12} more lines hidden)
            </Text>
          )}
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={palette.text.secondary}>
          {' '}[<Text bold color={palette.status.success}>y</Text>]es (default)
          {'  '}[<Text bold color={palette.text.secondary}>n</Text>]o
          {'  '}[<Text bold color={palette.text.accent}>a</Text>]lways for this session
          {'  '}[<Text bold color={palette.status.error}>d</Text>]eny all
        </Text>
      </Box>
    </Box>
  );
}
