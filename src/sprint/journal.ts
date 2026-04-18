import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import type { SprintStatus, TaskStateRow, JournalEvent, SprintProgress, VerificationResult } from './types.js';
import type { TraceEntry } from '../agent/loop.js';

import { execSync } from 'node:child_process';

const _require = createRequire(import.meta.url);

function loadBetterSqlite3(): any {
  try {
    return _require('better-sqlite3');
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'MODULE_NOT_FOUND' && !(e instanceof Error && e.message.includes('NODE_MODULE_VERSION'))) throw e;
    const pkgDir = path.resolve(path.dirname(_require.resolve('better-sqlite3/package.json')), '..');
    try { execSync('npm rebuild better-sqlite3 --loglevel=error', { cwd: pkgDir, stdio: 'pipe' }); }
    catch { execSync('npm install better-sqlite3 --legacy-peer-deps --loglevel=error', { cwd: pkgDir, stdio: 'pipe' }); }
    return _require('better-sqlite3');
  }
}

const Database = loadBetterSqlite3();
const yaml = _require('js-yaml');

export class SprintJournal {
  private db: any;
  private sprintId: string;
  private dbPath: string;

  constructor(sprintId: string) {
    this.sprintId = sprintId;
    const journalDir = path.join(os.homedir(), '.dirgha', 'journals');
    fs.mkdirSync(journalDir, { recursive: true });
    this.dbPath = path.join(journalDir, `${sprintId}.db`);
    this.db = new Database(this.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sprint_meta (
        sprint_id TEXT PRIMARY KEY,
        goal TEXT NOT NULL,
        manifest_yaml TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_state (
        task_id TEXT NOT NULL,
        sprint_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        git_sha TEXT,
        verify_log TEXT,
        agent_output TEXT,
        error_log TEXT,
        PRIMARY KEY (task_id, sprint_id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sprint_id TEXT NOT NULL,
        task_id TEXT,
        ts TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT,
        git_sha TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_sprint ON events(sprint_id, ts);
      CREATE INDEX IF NOT EXISTS idx_task_state_sprint ON task_state(sprint_id);
    `);
    // Migrate: add trace_log column if not present
    try {
      this.db.exec(`ALTER TABLE task_state ADD COLUMN trace_log TEXT`);
    } catch { /* column may already exist */ }
  }

  initSprint(sprintId: string, goal: string, manifestYaml: string): void {
    const now = new Date().toISOString();
    
    let taskIds: string[] = [];
    try {
      const manifest = yaml.load(manifestYaml) as any;
      if (manifest && Array.isArray(manifest.tasks)) {
        taskIds = manifest.tasks.map((t: any) => t.id).filter((id: any) => typeof id === 'string');
      }
    } catch (e) {
      console.warn('Failed to parse manifest YAML for task extraction:', e);
    }

    const insertMeta = this.db.prepare(`
      INSERT INTO sprint_meta (sprint_id, goal, manifest_yaml, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const insertTask = this.db.prepare(`
      INSERT INTO task_state (task_id, sprint_id, status, attempts)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      insertMeta.run(sprintId, goal, manifestYaml, 'running', now, now);
      for (const taskId of taskIds) {
        insertTask.run(taskId, sprintId, 'pending', 0);
      }
    });
    
    transaction();
  }

  getSprintStatus(sprintId: string): SprintStatus {
    const row = this.db.prepare('SELECT status FROM sprint_meta WHERE sprint_id = ?').get(sprintId);
    if (!row) {
      throw new Error(`Sprint ${sprintId} not found`);
    }
    return row.status as SprintStatus;
  }

  setSprintStatus(sprintId: string, status: SprintStatus): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE sprint_meta SET status = ?, updated_at = ? WHERE sprint_id = ?')
      .run(status, now, sprintId);
  }

  getTaskState(taskId: string): TaskStateRow | undefined {
    const row = this.db.prepare('SELECT * FROM task_state WHERE task_id = ? AND sprint_id = ?')
      .get(taskId, this.sprintId);
    if (!row) return undefined;
    return this.deserializeTaskState(row);
  }

  getAllTaskStates(): TaskStateRow[] {
    const rows = this.db.prepare('SELECT * FROM task_state WHERE sprint_id = ?')
      .all(this.sprintId);
    return rows.map((r: any) => this.deserializeTaskState(r));
  }

  private deserializeTaskState(row: any): TaskStateRow {
    return {
      ...row,
      verifyLog: row.verify_log ? JSON.parse(row.verify_log) as VerificationResult[] : undefined
    } as TaskStateRow;
  }

  setTaskStatus(
    taskId: string, 
    status: string, 
    extra?: { gitSha?: string; verifyLog?: VerificationResult[]; agentOutput?: string; errorLog?: string }
  ): void {
    const updates: string[] = ['status = ?'];
    const values: any[] = [status];
    
    if (extra?.gitSha !== undefined) {
      updates.push('git_sha = ?');
      values.push(extra.gitSha);
    }
    if (extra?.verifyLog !== undefined) {
      updates.push('verify_log = ?');
      values.push(JSON.stringify(extra.verifyLog));
    }
    if (extra?.agentOutput !== undefined) {
      updates.push('agent_output = ?');
      values.push(extra.agentOutput);
    }
    if (extra?.errorLog !== undefined) {
      updates.push('error_log = ?');
      values.push(extra.errorLog);
    }
    
    values.push(taskId, this.sprintId);
    
    const sql = `UPDATE task_state SET ${updates.join(', ')} WHERE task_id = ? AND sprint_id = ?`;
    this.db.prepare(sql).run(...values);
  }

  incrementAttempts(taskId: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE task_state 
      SET attempts = attempts + 1,
          started_at = COALESCE(started_at, ?)
      WHERE task_id = ? AND sprint_id = ?
    `).run(now, taskId, this.sprintId);
  }

  addEvent(event: Omit<JournalEvent, 'id' | 'ts'>): void {
    const ts = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO events (sprint_id, task_id, ts, type, payload, git_sha)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      event.sprintId,
      event.taskId ?? null,
      ts,
      event.type,
      event.payload ? JSON.stringify(event.payload) : null,
      event.gitSha ?? null
    );
  }

  getEvents(limit?: number): JournalEvent[] {
    let sql = 'SELECT * FROM events WHERE sprint_id = ? ORDER BY ts DESC';
    const stmt = limit !== undefined 
      ? this.db.prepare(sql + ' LIMIT ?')
      : this.db.prepare(sql);
    
    const rows = limit !== undefined 
      ? stmt.all(this.sprintId, limit) 
      : stmt.all(this.sprintId);
    
    return rows.map((r: any) => ({
      ...r,
      payload: r.payload ? JSON.parse(r.payload) : undefined
    }));
  }

  getProgress(): SprintProgress {
    const meta = this.db.prepare('SELECT * FROM sprint_meta WHERE sprint_id = ?').get(this.sprintId);
    if (!meta) {
      throw new Error(`Sprint ${this.sprintId} not found`);
    }
    
    const tasks = this.getAllTaskStates();
    
    const startedAt = meta.created_at as string | undefined;
    const elapsedMs = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
    return {
      sprintId: meta.sprint_id,
      goal: meta.goal,
      status: meta.status as SprintStatus,
      tasks,
      startedAt,
      elapsedMs,
      currentTask: tasks.find(t => t.status === 'running')?.taskId,
    } as SprintProgress;
  }

  saveTaskTrace(taskId: string, trace: TraceEntry[]): void {
    this.db.prepare('UPDATE task_state SET trace_log = ? WHERE task_id = ? AND sprint_id = ?')
      .run(JSON.stringify(trace), taskId, this.sprintId);
  }

  getTaskTrace(taskId: string): TraceEntry[] | null {
    const row = this.db.prepare('SELECT trace_log FROM task_state WHERE task_id = ? AND sprint_id = ?')
      .get(taskId, this.sprintId) as { trace_log?: string } | undefined;
    if (!row?.trace_log) return null;
    try { return JSON.parse(row.trace_log); } catch { return null; }
  }

  close(): void {
    this.db.close();
  }
}
