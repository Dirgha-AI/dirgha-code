/**
 * JitterFreeRenderer.tsx — Eliminates UI flicker and jitter in streaming output
 * 
 * Key fixes:
 * 1. Debounced frame updates (60fps cap)
 * 2. Batched DOM writes
 * 3. RAF-based smooth scrolling
 * 4. Double-buffering for content updates
 * 5. Stable cursor positioning
 * 6. Reduced motion support
 */
import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Box, Text, useStdout, useStdin } from 'ink';
import { C } from '../colors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS; // ~16.67ms
const DEBOUNCE_MS = 16;
const MAX_BUFFER_SIZE = 10000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface JitterFreeRendererProps {
  children: React.ReactNode;
  className?: string;
  stableHeight?: boolean;
  reducedMotion?: boolean;
}

interface BufferState {
  content: React.ReactNode;
  timestamp: number;
  frameNumber: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Frame Rate Controller
// ─────────────────────────────────────────────────────────────────────────────

class FrameController {
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private pendingUpdate: (() => void) | null = null;
  private isActive = false;

  schedule(update: () => void): void {
    this.pendingUpdate = update;
    
    if (!this.isActive) {
      this.isActive = true;
      this.rafId = requestAnimationFrame((time) => this.onFrame(time));
    }
  }

  private onFrame(time: number): void {
    const elapsed = time - this.lastFrameTime;
    
    if (elapsed >= FRAME_TIME) {
      // Time to render
      this.lastFrameTime = time;
      if (this.pendingUpdate) {
        this.pendingUpdate();
        this.pendingUpdate = null;
      }
    }
    
    // Schedule next frame if there's more work
    if (this.pendingUpdate) {
      this.rafId = requestAnimationFrame((t) => this.onFrame(t));
    } else {
      this.isActive = false;
      this.rafId = null;
    }
  }

  cancel(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isActive = false;
    this.pendingUpdate = null;
  }
}

// Global frame controller instance
const globalFrameController = new FrameController();

// ─────────────────────────────────────────────────────────────────────────────
// Double Buffer Hook
// ─────────────────────────────────────────────────────────────────────────────

function useDoubleBuffer<T>(
  currentValue: T,
  comparator: (a: T, b: T) => boolean = (a, b) => a === b
): { front: T; back: T; swap: () => void } {
  const [front, setFront] = useState<T>(currentValue);
  const [back, setBack] = useState<T>(currentValue);
  const backRef = useRef<T>(currentValue);
  const frameCount = useRef(0);

  // Update back buffer immediately
  useEffect(() => {
    if (!comparator(currentValue, backRef.current)) {
      backRef.current = currentValue;
      setBack(currentValue);
    }
  }, [currentValue, comparator]);

  const swap = useCallback(() => {
    frameCount.current++;
    // Only swap every N frames to reduce flicker
    if (frameCount.current % 2 === 0) {
      setFront(backRef.current);
    }
  }, []);

  return { front, back, swap };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const JitterFreeRenderer = memo(function JitterFreeRenderer({
  children,
  stableHeight = true,
  reducedMotion = false,
}: JitterFreeRendererProps): React.JSX.Element {
  const { stdout } = useStdout();
  const { stdin } = useStdin();
  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;

  // Double buffer for smooth updates
  const [displayContent, setDisplayContent] = useState<React.ReactNode>(children);
  const pendingContent = useRef<React.ReactNode>(children);
  const updateScheduled = useRef(false);
  const lastUpdateTime = useRef(0);
  const frameControllerRef = useRef(new FrameController());

  // Debounced update
  const scheduleUpdate = useCallback(() => {
    if (updateScheduled.current) return;
    
    updateScheduled.current = true;
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime.current;
    const delay = Math.max(0, DEBOUNCE_MS - timeSinceLastUpdate);

    setTimeout(() => {
      frameControllerRef.current.schedule(() => {
        setDisplayContent(pendingContent.current);
        lastUpdateTime.current = Date.now();
        updateScheduled.current = false;
      });
    }, delay);
  }, []);

  // Update back buffer when children change
  useEffect(() => {
    pendingContent.current = children;
    scheduleUpdate();
  }, [children, scheduleUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      frameControllerRef.current.cancel();
    };
  }, []);

  // Reduced motion: skip all animations
  if (reducedMotion) {
    return (
      <Box flexDirection="column">
        {children}
      </Box>
    );
  }

  return (
    <Box 
      flexDirection="column"
      height={stableHeight ? rows - 4 : undefined}
      overflow="hidden"
    >
      {displayContent}
    </Box>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Stable Scroll Container
// ─────────────────────────────────────────────────────────────────────────────

interface StableScrollProps {
  children: React.ReactNode;
  maxHeight?: number;
  autoScroll?: boolean;
  scrollSpeed?: 'slow' | 'normal' | 'fast';
}

export const StableScroll = memo(function StableScroll({
  children,
  maxHeight = 20,
  autoScroll = true,
  scrollSpeed = 'normal',
}: StableScrollProps): React.JSX.Element {
  const scrollRef = useRef<number>(0);
  const [visibleStart, setVisibleStart] = useState(0);
  const contentArray = React.Children.toArray(children);
  const totalLines = contentArray.length;

  // Convert children to array for indexing
  const visibleChildren = contentArray.slice(visibleStart, visibleStart + maxHeight);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (autoScroll && totalLines > maxHeight) {
      const targetScroll = Math.max(0, totalLines - maxHeight);
      // Smooth scroll with easing
      const animate = () => {
        const diff = targetScroll - scrollRef.current;
        if (Math.abs(diff) < 0.5) {
          scrollRef.current = targetScroll;
          setVisibleStart(targetScroll);
          return;
        }
        scrollRef.current += diff * 0.3; // Ease out
        setVisibleStart(Math.floor(scrollRef.current));
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }, [totalLines, maxHeight, autoScroll]);

  return (
    <Box flexDirection="column" height={maxHeight}>
      {visibleChildren}
      {totalLines > maxHeight && (
        <Box marginTop={1}>
          <Text color={C.textFaint} dimColor>
            {visibleStart + 1}-{Math.min(visibleStart + maxHeight, totalLines)} of {totalLines}
            {' '}
            {visibleStart > 0 && '(↑ scroll up)'}
            {visibleStart + maxHeight < totalLines && '(↓ scroll down)'}
          </Text>
        </Box>
      )}
    </Box>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Stable Cursor Component
// ─────────────────────────────────────────────────────────────────────────────

interface StableCursorProps {
  visible?: boolean;
  blinkRate?: number;
  char?: string;
  color?: string;
}

export const StableCursor = memo(function StableCursor({
  visible = true,
  blinkRate = 530,
  char = '█',
  color = C.accent,
}: StableCursorProps): React.JSX.Element | null {
  const [isVisible, setIsVisible] = useState(visible);
  const rafRef = useRef<number | null>(null);
  const lastToggle = useRef(0);

  useEffect(() => {
    if (!visible) {
      setIsVisible(false);
      return;
    }

    const animate = (time: number) => {
      if (time - lastToggle.current >= blinkRate) {
        setIsVisible(v => !v);
        lastToggle.current = time;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [visible, blinkRate]);

  if (!isVisible) return null;

  return <Text color={color}>{char}</Text>;
});

// ─────────────────────────────────────────────────────────────────────────────
// Text Stream Stabilizer
// ─────────────────────────────────────────────────────────────────────────────

interface TextStreamProps {
  text: string;
  onComplete?: () => void;
  charDelay?: number;
  chunkSize?: number;
}

export const TextStream = memo(function TextStream({
  text,
  onComplete,
  charDelay = 10,
  chunkSize = 5,
}: TextStreamProps): React.JSX.Element {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastUpdate = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed('');

    const animate = (time: number) => {
      if (time - lastUpdate.current >= charDelay) {
        const nextIndex = Math.min(indexRef.current + chunkSize, text.length);
        indexRef.current = nextIndex;
        setDisplayed(text.slice(0, nextIndex));
        lastUpdate.current = time;

        if (nextIndex >= text.length) {
          onComplete?.();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [text, charDelay, chunkSize, onComplete]);

  return <Text>{displayed}</Text>;
});

// ─────────────────────────────────────────────────────────────────────────────
// Smooth Spinner (non-jitter)
// ─────────────────────────────────────────────────────────────────────────────

interface SmoothSpinnerProps {
  label?: string;
  color?: string;
}

export const SmoothSpinner = memo(function SmoothSpinner({
  label = 'thinking',
  color = C.accent,
}: SmoothSpinnerProps): React.JSX.Element {
  const [frame, setFrame] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastUpdate = useRef(0);
  
  // Unicode smooth frames (less jitter than braille)
  const frames = ['◐', '◓', '◑', '◒'];

  useEffect(() => {
    const animate = (time: number) => {
      if (time - lastUpdate.current >= 120) { // 120ms per frame = ~8fps (smooth)
        setFrame(f => (f + 1) % frames.length);
        lastUpdate.current = time;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return (
    <Box gap={1}>
      <Text color={color}>{frames[frame]}</Text>
      <Text color={C.textDim}>{label}</Text>
    </Box>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Export utilities
// ─────────────────────────────────────────────────────────────────────────────

export const JitterUtils = {
  // Debounce function calls
  debounce: <T extends (...args: any[]) => void>(
    fn: T,
    ms: number
  ): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  },

  // Throttle function calls to frame rate
  throttleToFrame: <T extends (...args: any[]) => void>(
    fn: T
  ): ((...args: Parameters<T>) => void) => {
    let rafId: number | null = null;
    let pendingArgs: Parameters<T> | null = null;
    
    return (...args: Parameters<T>) => {
      pendingArgs = args;
      
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          if (pendingArgs) {
            fn(...pendingArgs);
            pendingArgs = null;
          }
          rafId = null;
        });
      }
    };
  },

  // Measure render time for debugging
  measureRender: <T,>(fn: () => T, label: string): T => {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    if (duration > 16) { // Log slow renders
      console.error(`[Jitter] Slow render: ${label} took ${duration.toFixed(2)}ms`);
    }
    return result;
  },
};

export default JitterFreeRenderer;
