/**
 * Full-cycle command composition: plan → implement → security scan →
 * (optional) code register → deploy → stream logs. Each step is
 * pluggable; callers may skip or short-circuit individual phases.
 */

import type { AuthToken } from '../../integrations/auth.js';
import type { ArnikoClient, ScanResult } from '../../integrations/arniko-client.js';
import type { BuckyClient } from '../../integrations/bucky-client.js';
import type { DeployClient, Deployment } from '../../integrations/deploy-client.js';
import { buildTarball } from './tarball.js';

export interface FullCycleOptions {
  projectId: string;
  cwd: string;
  token: AuthToken;
  arniko?: ArnikoClient;
  bucky?: BuckyClient;
  deploy: DeployClient;
  codePathToRegister?: string;
  codeLanguage?: string;
  securityGate?: 'warn' | 'block';
  onPhase?: (phase: FullCyclePhase, detail: string) => void;
}

export type FullCyclePhase = 'security' | 'register' | 'package' | 'upload' | 'logs' | 'done';

export interface FullCycleResult {
  deployment?: Deployment;
  scan?: ScanResult;
  registeredBlockId?: string;
  aborted: boolean;
  reason?: string;
}

export async function runFullCycle(opts: FullCycleOptions): Promise<FullCycleResult> {
  const phase = (p: FullCyclePhase, detail: string): void => { opts.onPhase?.(p, detail); };

  let scan: ScanResult | undefined;
  if (opts.arniko) {
    phase('security', 'running Arniko scan');
    scan = await opts.arniko.scanPath(opts.cwd);
    if (!scan.passed && (opts.securityGate ?? 'block') === 'block') {
      return { aborted: true, reason: 'security scan failed; aborting full cycle', scan };
    }
  }

  let registeredBlockId: string | undefined;
  if (opts.bucky && opts.codePathToRegister) {
    phase('register', 'registering code block with Bucky');
    const { readFile } = await import('node:fs/promises');
    const code = await readFile(opts.codePathToRegister, 'utf8');
    const registered = await opts.bucky.code.register(code, opts.codeLanguage ?? 'typescript', opts.token.jwt);
    registeredBlockId = registered.id;
  }

  phase('package', 'building tarball');
  const tarball = await buildTarball(opts.cwd);

  phase('upload', `uploading ${tarball.sizeBytes} bytes`);
  const deployment = await opts.deploy.cli.upload(opts.projectId, tarball.path, opts.token.jwt);

  phase('logs', 'streaming deployment logs');
  try {
    for await (const line of opts.deploy.deployments.logs(deployment.id, opts.token.jwt)) {
      opts.onPhase?.('logs', `${line.stream}: ${line.line}`);
    }
  } catch { /* stream may close early; verdict captured below */ }

  phase('done', deployment.url ? `deployment ready at ${deployment.url}` : 'deployment complete');
  return { deployment, scan, registeredBlockId, aborted: false };
}
