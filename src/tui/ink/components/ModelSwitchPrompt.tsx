/**
 * Inline model-switch prompt.
 *
 * Renders below an error item when the kernel attached a `failoverModel`
 * suggestion. Three single-key answers:
 *   y → swap currentModel to the suggestion, retry the failed turn
 *   n → keep current model, surface the original error
 *   p → open the model picker so the user can pick anything
 *
 * Stays mounted only until a key is pressed; App removes it from state
 * after the choice resolves.
 */

import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../theme-context.js';

export interface ModelSwitchPromptProps {
  failedModel: string;
  failoverModel: string;
  onAccept: (failoverModel: string) => void;
  onReject: () => void;
  onPicker: () => void;
}

export function ModelSwitchPrompt(props: ModelSwitchPromptProps): React.JSX.Element {
  const palette = useTheme();
  useInput((ch, _key) => {
    if (ch === 'y' || ch === 'Y') {
      props.onAccept(props.failoverModel);
    } else if (ch === 'n' || ch === 'N') {
      props.onReject();
    } else if (ch === 'p' || ch === 'P') {
      props.onPicker();
    }
  }, { isActive: true });

  return (
    <Box marginBottom={1} paddingX={1} borderStyle="round" borderColor={palette.status.warning} flexDirection="column">
      <Box>
        <Text color={palette.status.warning} bold>! </Text>
        <Text color={palette.text.primary}>
          {' '}<Text bold>{props.failedModel}</Text> failed — try{' '}
          <Text bold color={palette.text.accent}>{props.failoverModel}</Text>?
        </Text>
      </Box>
      <Box>
        <Text color={palette.text.secondary}>
          {' '}[<Text bold color={palette.status.success}>y</Text>] yes
          {'  '}[<Text bold color={palette.text.secondary}>n</Text>] no
          {'  '}[<Text bold color={palette.text.accent}>p</Text>] picker
        </Text>
      </Box>
    </Box>
  );
}
