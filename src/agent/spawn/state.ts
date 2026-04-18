/**
 * agent/spawn/state.ts — Agent state management (list, clone, snapshot)
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Agent, SnapshotMeta } from './types.js';
import { MNGR_DIR, listTmuxSessions, tmuxSessionName, loadAgentConfig, checkSession } from './utils.js';
import { createAgent } from './lifecycle.js';

export async function listAgents(): Promise<Agent[]> {
  const sessions = listTmuxSessions();
  const agents: Agent[] = [];

  for (const name of sessions) {
    const config = loadAgentConfig(name);
    if (config) {
      agents.push({
        ...config,
        status: checkSession(name) ? 'running' : 'stopped',
      });
    }
  }

  return agents;
}

export async function cloneAgent(sourceName: string, newName: string): Promise<Agent> {
  const source = loadAgentConfig(sourceName);
  if (!source) throw new Error(`Source agent "${sourceName}" not found`);

  const newWorkDir = join(MNGR_DIR, newName, 'workspace');
  mkdirSync(newWorkDir, { recursive: true });
  
  spawnSync('cp', ['-r', `${source.workDir}/.`, newWorkDir], { 
    encoding: 'utf8', shell: false 
  });

  return createAgent({
    name: newName,
    host: source.host,
    provider: source.provider,
    model: source.model,
    workDir: newWorkDir,
    idleTimeout: source.idleTimeout,
    noConnect: true,
  });
}

export async function snapshotAgent(name: string): Promise<string> {
  const agentDir = join(MNGR_DIR, name);
  const snapshotId = randomUUID().slice(0, 8);
  const snapshotDir = join(MNGR_DIR, '.snapshots', snapshotId);
  
  mkdirSync(snapshotDir, { recursive: true });
  spawnSync('cp', ['-r', `${agentDir}/.`, snapshotDir], { encoding: 'utf8', shell: false });

  const meta: SnapshotMeta = {
    id: snapshotId,
    agentName: name,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(snapshotDir, 'snapshot.json'), JSON.stringify(meta, null, 2));

  return snapshotId;
}
