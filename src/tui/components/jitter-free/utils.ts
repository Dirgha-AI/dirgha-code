/**
 * utils.ts — Utility functions for jitter-free rendering
 */

/**
 * Debounce a function to limit how often it can fire
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Throttle function calls to frame rate using RAF
 */
export function throttleToFrame<T extends (...args: any[]) => void>(
  fn: T
): (...args: Parameters<T>) => void {
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
}

/**
 * Measure render time for debugging slow renders
 */
export function measureRender<T>(fn: () => T, label: string): T {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  if (duration > 16) {
    console.error(`[Jitter] Slow render: ${label} took ${duration.toFixed(2)}ms`);
  }

  return result;
}
