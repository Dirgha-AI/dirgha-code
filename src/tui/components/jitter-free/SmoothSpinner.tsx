// @ts-nocheck
/**
 * SmoothSpinner.tsx — 8fps smooth spinner (vs default 12.5fps)
 */

import React, { useState, useEffect, memo } from 'react';
import { Text } from 'ink';
import { C } from '../../colors.js';
import { SmoothSpinnerProps } from './types.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SMOOTH_FPS = 8;
const FRAME_DELAY = 1000 / SMOOTH_FPS;

export const SmoothSpinner = memo(function SmoothSpinner({
  text = 'Loading...',
  fps = SMOOTH_FPS,
}: SmoothSpinnerProps): JSX.Element {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const delay = 1000 / fps;
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, delay);

    return () => clearInterval(interval);
  }, [fps]);

  return (
    <Text color={C.accent}>
      {SPINNER_FRAMES[frame]} {text}
    </Text>
  );
});

export default SmoothSpinner;
