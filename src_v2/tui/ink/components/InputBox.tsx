/**
 * Bottom-anchored prompt input.
 *
 * Uses `ink-text-input` for the editable field. Ctrl+C is handled here
 * (two presses within 1.5s exits) rather than relying on Ink's default
 * SIGINT so App can own the exit policy. Enter triggers onSubmit with
 * the trimmed value and clears the buffer.
 */

import * as React from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';

export interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  busy: boolean;
  placeholder?: string;
}

const CTRL_C_TIMEOUT_MS = 1500;

export function InputBox(props: InputBoxProps): React.JSX.Element {
  const { stdout } = useStdout();
  const { exit } = useApp();
  const cols = stdout?.columns ?? 80;
  const [ctrlCArmed, setCtrlCArmed] = React.useState(false);
  const armTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return (): void => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, []);

  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      if (ctrlCArmed) {
        exit();
        return;
      }
      setCtrlCArmed(true);
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
      armTimerRef.current = setTimeout(() => setCtrlCArmed(false), CTRL_C_TIMEOUT_MS);
    }
  });

  const borderColour = props.busy ? 'cyan' : 'magenta';
  const promptColour = props.busy ? 'cyan' : 'magenta';

  return (
    <Box flexDirection="column" width={cols}>
      <Box borderStyle="single" borderColor={borderColour} paddingX={1}>
        <Box gap={1} flexGrow={1}>
          <Text color={promptColour}>❯</Text>
          <TextInput
            value={props.value}
            onChange={props.onChange}
            onSubmit={props.onSubmit}
            placeholder={props.placeholder ?? 'Ask dirgha anything…'}
            showCursor={!props.busy}
            focus={!props.busy}
          />
        </Box>
      </Box>
      {ctrlCArmed && (
        <Box paddingX={1}>
          <Text color="yellow">Press Ctrl+C again to exit.</Text>
        </Box>
      )}
    </Box>
  );
}
