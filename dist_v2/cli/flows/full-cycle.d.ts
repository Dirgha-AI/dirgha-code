/**
 * Full-cycle command composition: plan → implement → security scan →
 * (optional) code register → deploy → stream logs. Each step is
 * pluggable; callers may skip or short-circuit individual phases.
 */
import type { AuthToken } from '../../integrations/auth.js';
import type { ArnikoClient, ScanResult } from '../../integrations/arniko-client.js';
import type { BuckyClient } from '../../integrations/bucky-client.js';
import type { DeployClient, Deployment } from '../../integrations/deploy-client.js';
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
export declare function runFullCycle(opts: FullCycleOptions): Promise<FullCycleResult>;
