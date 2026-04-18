/**
 * agent/spawn/lifecycle.ts — Agent lifecycle operations (create, destroy, start, stop)
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Agent, CreateAgentOptions } from './types.js';
import { 
  MNGR_DIR, initAgentDir, tmuxSessionName, checkTmux, 
  saveAgentConfig, loadAgentConfig, cleanupAgent, checkSession 
} from './utils.js';
import { sendMessage } from './messaging.js';

export async function createAgent(options: CreateAgentOptions = {}): Promise<Agent> {
  initAgentDir();
  
  if (!checkTmux()) {
    throw new Error('tmux is required. Install with: apt-get install tmux');
  }

  const name = options.name || `agent-${randomUUID().slice(0, 8)}`;
  const sessionName = tmuxSessionName(name);
  
  if (loadAgentConfig(name)) {
    throw new Error(`Agent "${name}" already exists.`);
  }

  const workDir = options.workDir || join(MNGR_DIR, name, 'workspace');
  mkdirSync(workDir, { recursive: true });

  const agent: Agent = {
    id: randomUUID(),
    name,
    host: options.host || 'local',
    tmuxSession: sessionName,
    workDir,
    status: 'running',
    provider: options.provider || 'anthropic',
    model: options.model,
    idleTimeout: options.idleTimeout,
    createdAt: new Date(),
    lastActivity: new Date(),
  };

  saveAgentConfig(agent);

  const agentCmd = buildAgentCommand(options);
  const tmuxCmd = ['tmux', 'new-session', '-d', '-s', sessionName, '-c', workDir, ...agentCmd];
  
  const result = spawnSync(tmuxCmd[0], tmuxCmd.slice(1), { 
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, DIRGHA_AGENT_ID: agent.id }
  });

  if (result.status !== 0) {
    throw new Error(`Failed to create agent: ${result.stderr}`);
  }

  if (options.message) {
    await sendMessage(name, options.message);
  }

  return agent;
}

function buildAgentCommand(options: CreateAgentOptions): string[] {
  let cmd: string[];
  
  if (options.provider === 'anthropic' || !options.provider) {
    cmd = ['claude'];
  } else if (options.provider === 'openai') {
    cmd = ['codex'];
  } else {
    cmd = ['dirgha', 'chat'];
  }
  
  if (options.model) cmd.push('--model', options.model);
  if (options.args) cmd.push(...options.args);
  
  return cmd;
}

export function destroyAgent(name: string): void {
  const sessionName = tmuxSessionName(name);
  spawnSync('tmux', ['kill-session', '-t', sessionName], { encoding: 'utf8', shell: false });
  cleanupAgent(name);
}

export async function stopAgent(name: string): Promise<void> {
  const sessionName = tmuxSessionName(name);
  spawnSync('tmux', ['detach-client', '-s', sessionName], { encoding: 'utf8', shell: false });
  
  const config = loadAgentConfig(name);
  if (config) {
    config.status = 'stopped';
    saveAgentConfig(config);
  }
}

export async function startAgent(name: string): Promise<void> {
  if (!checkSession(name)) {
    throw new Error(`Agent "${name}" does not exist.`);
  }
  
  const config = loadAgentConfig(name);
  if (config) {
    config.status = 'running';
    saveAgentConfig(config);
  }
}

export function connectAgent(name: string): void {
  if (!checkSession(name)) {
    throw new Error(`Agent "${name}" is not running.`);
  }
  
  spawn('tmux', ['attach-session', '-t', tmuxSessionName(name)], {
    stdio: 'inherit',
    shell: false
  });
}
