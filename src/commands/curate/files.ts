/**
 * File Attachment Utilities
 * @module commands/curate/files
 */
import { resolve, relative } from 'path';
import { getDB } from '../../session/db.js';
import type { FactFile } from './types.js';

export function createFactFiles(factId: string, filePaths: string[]): FactFile[] {
  return filePaths.map((f: string) => ({
    factId,
    filePath: resolve(f),
    lineStart: undefined,
    lineEnd: undefined,
  }));
}

export function persistFiles(files: FactFile[]): void {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT INTO fact_files (fact_id, file_path, line_start, line_end)
    VALUES (?, ?, ?, ?)
  `);

  for (const file of files) {
    stmt.run(file.factId, file.filePath, file.lineStart ?? null, file.lineEnd ?? null);
  }
}

export function formatFileList(files: FactFile[], cwd: string): string {
  return files.map(f => relative(cwd, f.filePath)).join(', ');
}
