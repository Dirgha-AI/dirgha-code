/**
 * agent/moim.ts — Metadata/Operational Information Message builder
 */
import { spawnSync } from 'node:child_process';

/**
 * Build ephemeral MOIM (Metadata/Operational Information Message) context.
 * Includes cwd, current time, and git branch. Omits git line if unavailable.
 */
export function buildMoim(): string {
  const cwd = process.cwd();
  const time = new Date().toISOString();

  let moim = `<context>\ncwd: ${cwd}\ntime: ${time}`;

  try {
    const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    if (result.status === 0 && result.stdout) {
      const branch = result.stdout.trim();
      moim += `\ngit: ${branch}`;
    }
  } catch {
    // Silently ignore git errors
  }

  moim += '\n</context>';
  return moim;
}
