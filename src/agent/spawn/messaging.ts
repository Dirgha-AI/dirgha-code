/**
 * agent/spawn/messaging.ts — Agent messaging and communication
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MNGR_DIR, tmuxSessionName, updateAgentActivity } from './utils.js';

export async function sendMessage(name: string, message: string): Promise<void> {
  const sessionName = tmuxSessionName(name);
  
  const result = spawnSync('tmux', [
    'send-keys', '-t', `${sessionName}.0`,
    message,
    'Enter'
  ], { encoding: 'utf8', shell: false });

  if (result.status !== 0) {
    throw new Error(`Failed to send message: ${result.stderr}`);
  }

  updateAgentActivity(name);
}

export async function execOnAgent(name: string, command: string): Promise<string> {
  const sessionName = tmuxSessionName(name);
  
  const result = spawnSync('tmux', [
    'send-keys', '-t', `${sessionName}.0`,
    command,
    'Enter'
  ], { encoding: 'utf8', shell: false });

  if (result.status !== 0) {
    throw new Error(`Failed to execute: ${result.stderr}`);
  }

  return result.stdout;
}

export function getTranscript(name: string): string {
  const logPath = join(MNGR_DIR, name, 'transcript.log');
  return existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
}
