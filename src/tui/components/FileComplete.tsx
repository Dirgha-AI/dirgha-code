/**
 * tui/components/FileComplete.tsx — @ file autocomplete overlay
 *
 * Shows when user types @<query> in the input. Lists matching files.
 * Enter inserts the selected file path; Esc cancels.
 * The parent expands @path/to/file.ts into its contents before submitting.
 */
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { C } from '../colors.js';

interface FileCompleteProps {
  query: string;       // text after the @
  matches: string[];   // file paths to show
  onSelect: (path: string) => void;
  onCancel: () => void;
}

export function FileComplete({ query, matches, onSelect, onCancel }: FileCompleteProps) {
  const visible = matches.slice(0, 10);

  useInput((_ch, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.return && visible.length > 0) onSelect(visible[0]!);
  });

  if (visible.length === 0) return null;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={C.accent} paddingX={1}>
      <Text color={C.textDim}>@ {query || '(type to filter)'}</Text>
      {visible.map((f, i) => (
        <Text key={f} color={i === 0 ? C.accent : C.textMuted}>
          {i === 0 ? '> ' : '  '}{f}
        </Text>
      ))}
      <Text color={C.textDim} dimColor>Tab/Enter to insert · Esc to cancel</Text>
    </Box>
  );
}
