/**
 * Eval report renderer. Emits a compact Markdown summary plus optional
 * JSON persistence.
 */
import type { EvalReport } from './types.js';
export declare function renderMarkdown(report: EvalReport): string;
export declare function writeReport(path: string, report: EvalReport): Promise<void>;
