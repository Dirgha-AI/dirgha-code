/**
 * polyfill.ts — Node.js polyfills for browser APIs used in TUI components.
 */

if (typeof requestAnimationFrame === 'undefined') {
  (global as any).requestAnimationFrame = (callback: (time: number) => void) => {
    return setTimeout(() => callback(Date.now()), 16);
  };
}

if (typeof cancelAnimationFrame === 'undefined') {
  (global as any).cancelAnimationFrame = (id: any) => {
    clearTimeout(id);
  };
}

if (typeof performance === 'undefined') {
  (global as any).performance = {
    now: () => Date.now(),
  };
}
