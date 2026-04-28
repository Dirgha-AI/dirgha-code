/**
 * Eval report renderer. Emits a compact Markdown summary plus optional
 * JSON persistence.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
export function renderMarkdown(report) {
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
export async function writeReport(path, report) {
    await mkdir(dirname(path), { recursive: true });
    if (path.endsWith('.md'))
        await writeFile(path, renderMarkdown(report), 'utf8');
    else
        await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
}
//# sourceMappingURL=reporter.js.map