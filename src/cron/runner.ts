/**
 * cron/runner.ts — Background daemon that checks for and executes overdue cron jobs.
 */
import { getNextDue, markRun, getJob } from './store.js';
import { runSingleTurn } from '../agent/loop.js';

let _timer: ReturnType<typeof setInterval> | null = null;

/** Check for and execute one overdue cron job. Returns result. */
export async function tickCron(model: string): Promise<{ ran: boolean; jobName?: string; output?: string }> {
  const job = getNextDue();
  if (!job) return { ran: false };

  let output = '';
  try {
    await runSingleTurn(
      job.command,
      model,
      (t) => { output += t; },
      () => {},
    );
  } catch (err) {
    output = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  markRun(job.id);
  return { ran: true, jobName: job.name, output };
}

/** Manually trigger a specific job by ID, regardless of schedule. */
export async function runJobNow(id: string, model: string): Promise<{ ran: boolean; jobName?: string; output?: string }> {
  const job = getJob(id);
  if (!job) return { ran: false };

  let output = '';
  try {
    await runSingleTurn(
      job.command,
      model,
      (t) => { output += t; },
      () => {},
    );
  } catch (err) {
    output = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  markRun(job.id);
  return { ran: true, jobName: job.name, output };
}

/** Start a background interval that checks for due jobs every 60 seconds. */
export function startCronDaemon(model: string): ReturnType<typeof setInterval> {
  if (_timer) return _timer;
  _timer = setInterval(() => {
    tickCron(model).catch(() => {});
  }, 60_000);
  // Don't block Node exit
  if (_timer && typeof _timer === 'object' && 'unref' in _timer) {
    _timer.unref();
  }
  return _timer;
}

/** Stop the background daemon. */
export function stopCronDaemon(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
