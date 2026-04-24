/**
 * Eval report renderer. Emits a compact Markdown summary plus optional
 * JSON persistence.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { EvalReport } from './types.js';

export function renderMarkdown(report: EvalReport): string {
  const passRate = report.total === 0 ? 0 : (report.passed / report.total) * 100;
  const lines = [
    `# Eval report: ${report.suite}`,
    ``,
    `- model: \`${report.model}\``,
    `- run: ${report.runAt}`,
    `- duration: ${report.durationMs}ms`,
    `- pass rate: ${report.passed}/${report.total} (${passRate.toFixed(1)}%)`,
    ``,
    `## Results`,
    ``,
    '| Task | Status | Duration | Reason |',
    '| --- | --- | --- | --- |',
  ];
  for (const r of report.results) {
    lines.push(`| \`${r.taskId}\` | ${r.ok ? 'pass' : 'fail'} | ${r.durationMs}ms | ${r.reason} |`);
  }
  return lines.join('\n');
}

export async function writeReport(path: string, report: EvalReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (path.endsWith('.md')) await writeFile(path, renderMarkdown(report), 'utf8');
  else await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
}
