import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

function getHeartbeatPath(sprintId: string): string {
  return path.join(os.homedir(), '.dirgha', 'sprints', `${sprintId}.heartbeat`);
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function quoteShell(str: string): string {
  return `"${str.replace(/"/g, '\\"')}"`;
}

export async function startWatchdog(sprintId: string, manifestPath: string): Promise<void> {
  const processName = `dirgha-sprint-${sprintId}`;
  const nodePath = process.argv[0];
  const cliEntry = path.resolve(process.argv[1]);
  
  // Check if process already exists
  let exists = false;
  try {
    execSync(`pm2 describe ${processName}`, { stdio: 'ignore' });
    exists = true;
  } catch {
    exists = false;
  }

  if (exists) {
    try {
      execSync(`pm2 restart ${processName}`, { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Failed to restart PM2 process ${processName}: ${error}`);
    }
  } else {
    const args = [
      'pm2',
      'start',
      quoteShell(nodePath),
      '--name',
      processName,
      '--restart-delay',
      '5000',
      '--max-restarts',
      '20',
      '--',
      quoteShell(cliEntry),
      'sprint',
      '_daemon',
      sprintId,
      quoteShell(manifestPath)
    ];
    
    try {
      execSync(args.join(' '), { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Failed to start PM2 process ${processName}: ${error}`);
    }
  }

  writeHeartbeat(sprintId);
}

export async function stopWatchdog(sprintId: string): Promise<void> {
  const processName = `dirgha-sprint-${sprintId}`;
  
  try {
    execSync(`pm2 stop ${processName}`, { stdio: 'ignore' });
  } catch {
    // Silently ignore errors (process may already be stopped)
  }

  const heartbeatPath = getHeartbeatPath(sprintId);
  try {
    if (fs.existsSync(heartbeatPath)) {
      fs.unlinkSync(heartbeatPath);
    }
  } catch {
    // Silently ignore file removal errors
  }
}

export async function getWatchdogStatus(sprintId: string): Promise<'online' | 'stopped' | 'errored' | 'unknown'> {
  const processName = `dirgha-sprint-${sprintId}`;
  
  try {
    const output = execSync('pm2 jlist', { stdio: 'pipe', encoding: 'utf-8' });
    const processes = JSON.parse(output) as Array<{ name: string; pm2_env?: { status?: string } }>;
    
    const proc = processes.find(p => p.name === processName);
    if (!proc) {
      return 'unknown';
    }

    const status = proc.pm2_env?.status;
    
    if (status === 'online') {
      return 'online';
    } else if (status === 'stopped' || status === 'stopping') {
      return 'stopped';
    } else if (status === 'errored') {
      return 'errored';
    } else {
      return 'unknown';
    }
  } catch {
    return 'unknown';
  }
}

export function writeHeartbeat(sprintId: string): void {
  const heartbeatPath = getHeartbeatPath(sprintId);
  ensureDir(heartbeatPath);
  const timestamp = new Date().toISOString();
  fs.writeFileSync(heartbeatPath, timestamp, 'utf-8');
}

export function readHeartbeat(sprintId: string): Date | null {
  const heartbeatPath = getHeartbeatPath(sprintId);
  
  try {
    if (!fs.existsSync(heartbeatPath)) {
      return null;
    }
    const content = fs.readFileSync(heartbeatPath, 'utf-8').trim();
    const date = new Date(content);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  } catch {
    return null;
  }
}

export function isHeartbeatStale(sprintId: string, staleThresholdMs: number = 60000): boolean {
  const heartbeat = readHeartbeat(sprintId);
  if (!heartbeat) {
    return true;
  }
  
  const now = new Date();
  const diff = now.getTime() - heartbeat.getTime();
  return diff > staleThresholdMs;
}
