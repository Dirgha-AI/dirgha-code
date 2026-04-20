// @ts-nocheck — future migration to node:sqlite (Node 22.5+); not active yet
/**
 * SQLite Utilities - Native node:sqlite (Node 22.5+)
 * Replacement for better-sqlite3 — do not import until migration is complete
 */

import { DatabaseSync } from 'node:sqlite';

export interface SQLiteOptions {
  readonly?: boolean;
  create?: boolean;
  timeout?: number;
}

export class Database {
  private db: DatabaseSync;

  constructor(path: string, options: SQLiteOptions = {}) {
    this.db = new DatabaseSync(path, {
      open: options.readonly ? 0 : 1,
      create: options.create ?? true,
    });
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): Statement {
    const stmt = this.db.prepare(sql);
    return new Statement(stmt);
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

export class Statement {
  private stmt: ReturnType<DatabaseSync['prepare']>;

  constructor(stmt: ReturnType<DatabaseSync['prepare']>) {
    this.stmt = stmt;
  }

  run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number } {
    const result = this.stmt.run(...params);
    return {
      lastInsertRowid: result.lastInsertRowid ?? 0,
      changes: result.changes ?? 0,
    };
  }

  get<T = unknown>(...params: unknown[]): T | undefined {
    return this.stmt.get(...params) as T | undefined;
  }

  all<T = unknown>(...params: unknown[]): T[] {
    const results = this.stmt.all(...params);
    return results as T[];
  }

  iterate<T = unknown>(...params: unknown[]): IterableIterator<T> {
    return this.stmt.iterate(...params) as IterableIterator<T>;
  }
}

// Factory function for easier migration
export function openDatabase(path: string, options?: SQLiteOptions): Database {
  return new Database(path, options);
}

export default { openDatabase, Database };
