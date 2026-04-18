/**
 * types.ts — Type definitions for jitter-free rendering
 */

export interface JitterFreeRendererProps {
  children: React.ReactNode;
  className?: string;
  stableHeight?: boolean;
  reducedMotion?: boolean;
}

export interface BufferState {
  content: React.ReactNode;
  timestamp: number;
  frameNumber: number;
}

export interface StableScrollProps {
  children: React.ReactNode;
  smooth?: boolean;
}

export interface StableCursorProps {
  children: React.ReactNode;
  preservePosition?: boolean;
}

export interface SmoothSpinnerProps {
  text?: string;
  fps?: number;
}
