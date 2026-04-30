/**
 * Inline API key entry overlay.
 *
 * Shown automatically when a provider throws "X_API_KEY is required".
 * The user types their key, presses Enter → key is saved to
 * ~/.dirgha/keys.json (mode 0600) and the original request is retried.
 */

import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../theme-context.js';

export interface KeySetOverlayProps {
  /** e.g. "DEEPSEEK_API_KEY" */
  keyName: string;
  /** called with the entered value; parent saves + retries */
  onSave: (value: string) => void;
  onCancel: () => void;
}

const PROVIDER_HINT: Record<string, string> = {
  DEEPSEEK_API_KEY:    'Get yours at platform.deepseek.com/api-keys',
  OPENAI_API_KEY:      'Get yours at platform.openai.com/api-keys',
  ANTHROPIC_API_KEY:   'Get yours at console.anthropic.com/settings/keys',
  OPENROUTER_API_KEY:  'Get yours at openrouter.ai/settings/keys',
  NVIDIA_API_KEY:      'Get yours at build.nvidia.com (free tier available)',
  GEMINI_API_KEY:      'Get yours at aistudio.google.com/app/apikey',
  FIREWORKS_API_KEY:   'Get yours at fireworks.ai/settings/api-keys',
};

export function KeySetOverlay(props: KeySetOverlayProps): React.JSX.Element {
  const theme = useTheme();
  const [value, setValue] = React.useState('');
  const [masked, setMasked] = React.useState(true);
  const hint = PROVIDER_HINT[props.keyName] ?? `Set your ${props.keyName}`;

  useInput((_ch, key) => {
    if (key.escape) { props.onCancel(); return; }
    if (key.ctrl && _ch === 'h') { setMasked(m => !m); return; }
    if (key.return) {
      if (value.trim()) props.onSave(value.trim());
      return;
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent ?? 'cyan'}
      paddingX={2}
      paddingY={1}
      marginTop={1}
    >
      <Text color={theme.accent ?? 'cyan'} bold>
        API Key Required — {props.keyName}
      </Text>
      <Text color={theme.textMuted ?? 'gray'}>{hint}</Text>
      <Box marginTop={1} flexDirection="row">
        <Text color={theme.textPrimary ?? 'white'}>Key: </Text>
        <TextInput
          value={value}
          onChange={setValue}
          mask={masked ? '*' : undefined}
          placeholder="paste your key here"
          onSubmit={v => { if (v.trim()) props.onSave(v.trim()); }}
        />
      </Box>
      <Box marginTop={1} flexDirection="row" gap={3}>
        <Text color={theme.textMuted ?? 'gray'}>Enter to save · Esc to cancel · Ctrl+H to toggle mask</Text>
      </Box>
    </Box>
  );
}
