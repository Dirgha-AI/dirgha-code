/**
 * config.ts — Frame rate and buffer configuration
 */

export const TARGET_FPS = 60;
export const FRAME_TIME = 1000 / TARGET_FPS; // ~16.67ms
export const DEBOUNCE_MS = 16;
export const MAX_BUFFER_SIZE = 10000;
