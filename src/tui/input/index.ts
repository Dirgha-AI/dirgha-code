// @ts-nocheck
/**
 * tui/input/index.ts — Barrel exports for input system (split from InputBox).
 */
export {
  initialState,
  insertText,
  moveLeft,
  moveRight,
  deleteBackward,
  deleteForward,
  historyUp,
  historyDown,
  addToHistory
} from './state.js';

export { renderInputLine, renderHint } from './display.js';

export type { InputState, DisplayProps } from './state.js';
