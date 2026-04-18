/**
 * utils/startup-profiler.ts — Lightweight startup performance profiler.
 *
 * Records timing for each init step. Reports to stderr if any step exceeds
 * WARN_THRESHOLD_MS or total exceeds TOTAL_WARN_MS. Only active when
 * DIRGHA_PROFILE=1 or DIRGHA_DEBUG=1.
 */

const WARN_THRESHOLD_MS = 200;  // warn if single step > 200ms
const TOTAL_WARN_MS = 1000;     // warn if total startup > 1s

export interface ProfileEntry {
  name: string;
  startMs: number;
  durationMs: number;
}

class StartupProfiler {
  private enabled: boolean;
  private entries: ProfileEntry[] = [];
  private current: { name: string; startMs: number } | null = null;
  private t0 = Date.now();

  constructor() {
    this.enabled = process.env['DIRGHA_PROFILE'] === '1' || process.env['DIRGHA_DEBUG'] === '1';
  }

  begin(name: string): void {
    if (!this.enabled) return;
    if (this.current) this.end(); // auto-close previous step
    this.current = { name, startMs: Date.now() };
  }

  end(): void {
    if (!this.enabled || !this.current) return;
    const durationMs = Date.now() - this.current.startMs;
    this.entries.push({ name: this.current.name, startMs: this.current.startMs - this.t0, durationMs });
    this.current = null;
  }

  report(): void {
    if (!this.enabled) return;
    if (this.current) this.end();
    const total = Date.now() - this.t0;
    const lines = [`\n[startup] total=${total}ms`];
    for (const e of this.entries) {
      const flag = e.durationMs >= WARN_THRESHOLD_MS ? ' ⚠' : '';
      lines.push(`  +${String(e.startMs).padStart(4)}ms  ${String(e.durationMs).padStart(4)}ms  ${e.name}${flag}`);
    }
    if (total >= TOTAL_WARN_MS) {
      lines.push(`  ⚠ total startup > ${TOTAL_WARN_MS}ms — consider lazy-loading heavy imports`);
    }
    process.stderr.write(lines.join('\n') + '\n');
  }

  /** Measure an async init step. */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.begin(name);
    try { return await fn(); }
    finally { this.end(); }
  }
}

// Singleton shared across the process
export const profiler = new StartupProfiler();
