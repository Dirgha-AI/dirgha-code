// Track recently used projects for `dirgha projects` command
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PROJECTS_FILE = path.join(os.homedir(), '.dirgha', 'projects.json');
const MAX_PROJECTS = 20;

export interface ProjectEntry {
  dir: string;
  lastAccessed: string;  // ISO timestamp
  lastInstruction: string;
  sessionId: string;
}

function ensureDir(): void {
  const dir = path.dirname(PROJECTS_FILE);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // ignore errors
  }
}

function readProjects(): ProjectEntry[] {
  try {
    if (!fs.existsSync(PROJECTS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(PROJECTS_FILE, 'utf8');
    const parsed = JSON.parse(data) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeProjects(entries: ProjectEntry[]): void {
  try {
    ensureDir();
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(entries, null, 2), 'utf8');
  } catch {
    // ignore write errors
  }
}

export function trackProject(sessionId: string, instruction: string): void {
  const currentDir = process.cwd();
  const entries = readProjects();

  // Find existing entry for current dir and update, or prepend new
  const existingIdx = entries.findIndex(e => e.dir === currentDir);
  const newEntry: ProjectEntry = {
    dir: currentDir,
    lastAccessed: new Date().toISOString(),
    lastInstruction: instruction,
    sessionId,
  };

  if (existingIdx >= 0) {
    entries[existingIdx] = newEntry;
  } else {
    entries.unshift(newEntry);
  }

  // Sort by lastAccessed desc and trim
  entries.sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());
  const trimmed = entries.slice(0, MAX_PROJECTS);

  writeProjects(trimmed);
}

export function listProjects(): ProjectEntry[] {
  const entries = readProjects();
  return entries.sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());
}
