import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { ReplContext, SessionFile, SessionIndex, Message } from '../types.js';
import { upsertSession, appendMessage, getDB } from './db.js';

function sessionsDir(): string {
  return path.join(os.homedir(), '.dirgha', 'sessions');
}

function indexPath(): string {
  return path.join(sessionsDir(), 'index.json');
}

function ensureDir(): void {
  const d = sessionsDir();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function readIndex(): SessionIndex {
  const p = indexPath();
  if (!fs.existsSync(p)) return { sessions: [] };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as SessionIndex; } catch { return { sessions: [] }; }
}

function writeIndex(index: SessionIndex): void {
  ensureDir();
  fs.writeFileSync(indexPath(), JSON.stringify(index, null, 2), 'utf8');
}

export async function saveSession(ctx: ReplContext, name?: string): Promise<string> {
  ensureDir();
  const id = ctx.sessionId;
  const title = name || `Session ${new Date().toISOString().slice(0, 10)} (${ctx.messages.length} msgs)`;
  const now = new Date().toISOString();

  const file: SessionFile = {
    id,
    title,
    model: ctx.model,
    messages: ctx.messages,
    tokensUsed: ctx.totalTokens,
    createdAt: now,
    updatedAt: now,
  };

  fs.writeFileSync(path.join(sessionsDir(), `${id}.json`), JSON.stringify(file, null, 2), 'utf8');

  const index = readIndex();
  const existing = index.sessions.findIndex(s => s.id === id);
  const entry = { id, title, createdAt: now, model: ctx.model };
  if (existing >= 0) {
    index.sessions[existing] = entry;
  } else {
    index.sessions.push(entry);
  }
  writeIndex(index);
  return id;
}

export function listSessions(): SessionIndex['sessions'] {
  return readIndex().sessions;
}

export function loadSession(id: string): SessionFile | null {
  const index = readIndex();
  const entry = index.sessions.find(s => s.id === id || s.id.startsWith(id));
  if (!entry) return null;
  const p = path.join(sessionsDir(), `${entry.id}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as SessionFile; } catch { return null; }
}

// ---------------------------------------------------------------------------
// Database-backed persistence (preferred)
// ---------------------------------------------------------------------------

export async function saveDBSession(ctx: ReplContext, name?: string): Promise<string> {
  const id = ctx.sessionId;
  const title = name || `Session ${new Date().toISOString().slice(0, 10)} (${ctx.messages.length} msgs)`;
  
  upsertSession(id, title, ctx.model, ctx.totalTokens, 'user', process.cwd());
  
  // Clear old messages and re-insert
  const db = getDB();
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
  
  for (const msg of ctx.messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    appendMessage(id, msg.role, content, 0);
  }
  
  return id;
}

export function listDBSessions(): Array<{ id: string; title: string; createdAt: string; model: string }> {
  const db = getDB();
  const rows = db.prepare(`
    SELECT id, title, created_at as createdAt, model 
    FROM sessions 
    ORDER BY updated_at DESC
  `).all() as Array<{ id: string; title: string; createdAt: string; model: string }>;
  return rows;
}

export function loadDBSession(id: string): SessionFile | null {
  const db = getDB();
  
  // Find session by ID or partial match
  const sessionRow = db.prepare(`
    SELECT id, title, model, tokens, created_at as createdAt
    FROM sessions
    WHERE id = ? OR id LIKE ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(id, `${id}%`) as { id: string; title: string; model: string; tokens: number; createdAt: string } | undefined;
  
  if (!sessionRow) return null;
  
  const messages = db.prepare(`
    SELECT role, content, tokens
    FROM messages
    WHERE session_id = ?
    ORDER BY id ASC
  `).all(sessionRow.id) as Array<{ role: string; content: string; tokens: number }>;
  
  return {
    id: sessionRow.id,
    title: sessionRow.title,
    model: sessionRow.model,
    tokensUsed: sessionRow.tokens,
    createdAt: sessionRow.createdAt,
    updatedAt: new Date().toISOString(),
    messages: messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: m.content,
    })) as Message[],
  };
}

export function deleteSession(id: string): boolean {
  const index = readIndex();
  const entry = index.sessions.findIndex(s => s.id === id || s.id.startsWith(id));
  if (entry < 0) return false;
  
  const sessionId = index.sessions[entry].id;
  const p = path.join(sessionsDir(), `${sessionId}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  
  index.sessions.splice(entry, 1);
  writeIndex(index);
  return true;
}

export function deleteDBSession(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM sessions WHERE id = ? OR id LIKE ?').run(id, `${id}%`);
  return result.changes > 0;
}

// ── Attachments ────────────────────────────────────────────────────────────

interface AttachmentRecord {
  id: string;
  type: string;
  name: string;
  path: string;
  size: number;
  mime_type: string;
  content?: string;
  created_at: string;
}

export async function saveSessionAttachment(sessionId: string, attachment: { id: string; type: string; name: string; path: string; size: number; mimeType: string; content?: string }): Promise<void> {
  const db = getDB();
  db.prepare(`
    INSERT OR REPLACE INTO attachments (id, session_id, type, name, path, size, mime_type, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    attachment.id, sessionId, attachment.type, attachment.name, attachment.path, 
    attachment.size, attachment.mimeType, attachment.content || null
  );
}

export function getSessionAttachments(sessionId: string): AttachmentRecord[] {
  const db = getDB();
  return db.prepare(`
    SELECT id, type, name, path, size, mime_type as mimeType, content, created_at as createdAt
    FROM attachments
    WHERE session_id = ?
    ORDER BY created_at DESC
  `).all(sessionId) as AttachmentRecord[];
}
