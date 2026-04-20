/**
 * SQLite Utilities - Native node:sqlite (Node 22.5+)
 * Replacement for better-sqlite3
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
      open: !options.readonly,
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

  transaction<TArgs extends unknown[], TReturn>(fn: (...args: TArgs) => TReturn): (...args: TArgs) => TReturn {
    return (...args: TArgs): TReturn => {
      this.db.exec('BEGIN');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    };
  }
}

export class Statement {
  private stmt: ReturnType<DatabaseSync['prepare']>;

  constructor(stmt: ReturnType<DatabaseSync['prepare']>) {
    this.stmt = stmt;
  }

  run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number } {
    const result = this.stmt.run(...(params as any[]));
    return {
      lastInsertRowid: result.lastInsertRowid ?? 0,
      changes: Number(result.changes ?? 0),
    };
  }

  get<T = unknown>(...params: unknown[]): T | undefined {
    return this.stmt.get(...(params as any[])) as T | undefined;
  }

  all<T = unknown>(...params: unknown[]): T[] {
    return this.stmt.all(...(params as any[])) as T[];
  }

  iterate<T = unknown>(...params: unknown[]): IterableIterator<T> {
    return this.stmt.iterate(...(params as any[])) as IterableIterator<T>;
  }
}

// Factory function for easier migration
export function openDatabase(path: string, options?: SQLiteOptions): Database {
  return new Database(path, options);
}

export default { openDatabase, Database };
