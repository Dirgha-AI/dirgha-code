/**
 * agent/spawn/utils.ts — Agent spawning utilities
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Agent } from './types.js';

export const MNGR_DIR = join(homedir(), '.dirgha', 'agents');

export function initAgentDir(): void {
  mkdirSync(MNGR_DIR, { recursive: true });
}

export function tmuxSessionName(name: string): string {
  return `dirgha-${name}`;
}

export function checkTmux(): boolean {
  const result = spawnSync('which', ['tmux'], { encoding: 'utf8' });
  return result.status === 0;
}

export function listTmuxSessions(): string[] {
  const result = spawnSync('tmux', ['ls', '-F', '#{session_name}'], { 
    encoding: 'utf8',
    shell: false 
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .filter(s => s.startsWith('dirgha-'))
    .map(s => s.replace('dirgha-', ''));
}

export function checkSession(name: string): boolean {
  const result = spawnSync('tmux', ['has-session', '-t', tmuxSessionName(name)], { 
    encoding: 'utf8',
    shell: false 
  });
  return result.status === 0;
}

export function saveAgentConfig(agent: Agent): void {
  const configPath = join(MNGR_DIR, agent.name, 'config.json');
  writeFileSync(configPath, JSON.stringify(agent, null, 2));
}

export function loadAgentConfig(name: string): Agent | null {
  const configPath = join(MNGR_DIR, name, 'config.json');
  if (!existsSync(configPath)) return null;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return {
      ...config,
      createdAt: new Date(config.createdAt),
      lastActivity: new Date(config.lastActivity),
    };
  } catch {
    return null;
  }
}

export function updateAgentActivity(name: string): void {
  const configPath = join(MNGR_DIR, name, 'config.json');
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.lastActivity = new Date().toISOString();
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  }
}

export function cleanupAgent(name: string): void {
  const agentDir = join(MNGR_DIR, name);
  if (existsSync(agentDir)) {
    rmSync(agentDir, { recursive: true, force: true });
  }
}
