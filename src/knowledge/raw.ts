/**
 * knowledge/raw.ts — Raw document ingestion store.
 *
 * Unprocessed documents go here first. The compiler agent picks up
 * anything with compiled: false and turns it into wiki articles.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const RAW_DIR = path.join(os.homedir(), '.dirgha', 'knowledge', 'raw');
const MANIFEST_PATH = path.join(RAW_DIR, '.manifest.json');

export interface RawMeta {
  id: string;
  title: string;
  source: string;
  tags: string[];
  compiled: boolean;
  ingestedAt: string;
}

export interface RawDoc extends RawMeta {
  content: string;
}

function ensureDir(): void {
  if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });
}

function readManifest(): Record<string, RawMeta> {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch { return {}; }
}

function writeManifest(m: Record<string, RawMeta>): void {
  ensureDir();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

/** Ingest a document. Returns the assigned ID. */
export function ingest(content: string, meta: Omit<RawMeta, 'id' | 'compiled' | 'ingestedAt'>): string {
  ensureDir();
  const id = crypto.createHash('sha1').update(content).digest('hex').slice(0, 12);
  const record: RawMeta = { ...meta, id, compiled: false, ingestedAt: new Date().toISOString() };

  fs.writeFileSync(path.join(RAW_DIR, `${id}.md`), content, 'utf8');

  const manifest = readManifest();
  manifest[id] = record;
  writeManifest(manifest);
  return id;
}

/** Get all uncompiled documents. */
export function getUncompiled(): RawDoc[] {
  const manifest = readManifest();
  const docs: RawDoc[] = [];
  for (const [id, meta] of Object.entries(manifest)) {
    if (meta.compiled) continue;
    const p = path.join(RAW_DIR, `${id}.md`);
    if (!fs.existsSync(p)) continue;
    try {
      const content = fs.readFileSync(p, 'utf8');
      docs.push({ ...meta, content });
    } catch { /* skip */ }
  }
  return docs;
}

/** Mark a document as compiled. */
export function markCompiled(id: string): void {
  const manifest = readManifest();
  if (manifest[id]) {
    manifest[id]!.compiled = true;
    writeManifest(manifest);
  }
}

/** Get all raw documents (compiled and uncompiled). */
export function listRaw(): RawMeta[] {
  return Object.values(readManifest());
}

export function getRaw(id: string): RawDoc | null {
  const manifest = readManifest();
  const meta = manifest[id];
  if (!meta) return null;
  const p = path.join(RAW_DIR, `${id}.md`);
  if (!fs.existsSync(p)) return null;
  try { return { ...meta, content: fs.readFileSync(p, 'utf8') }; } catch { return null; }
}
