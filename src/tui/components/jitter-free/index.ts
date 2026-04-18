/**
 * jitter-free/index.ts — Barrel exports for jitter-free rendering system
 */

// Components
export { JitterFreeRenderer } from './JitterFreeRenderer.js';
export { StableScroll } from './StableScroll.js';
export { StableCursor } from './StableCursor.js';
export { SmoothSpinner } from './SmoothSpinner.js';

// Hooks
export { useDoubleBuffer, useDebounceRender, useScrollBuffer } from './hooks/index.js';

// Utilities
export { debounce, throttleToFrame, measureRender } from './utils.js';

// Core classes
export { FrameController, globalFrameController } from './FrameController.js';

// Types
export type {
  JitterFreeRendererProps,
  BufferState,
  StableScrollProps,
  StableCursorProps,
  SmoothSpinnerProps,
} from './types.js';

// Config
export { TARGET_FPS, FRAME_TIME, DEBOUNCE_MS, MAX_BUFFER_SIZE } from './config.js';
