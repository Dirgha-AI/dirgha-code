/**
 * Bucky client. Thin wrapper over the Hono.js service (default port
 * 3002). All methods take an explicit bearer token argument so callers
 * can control scope (gateway passthrough vs anonymous for public
 * endpoints).
 */

import { jsonRequest } from './http.js';

export interface BuckyTask { id: string; status: string; title: string; payload?: unknown; }
export interface Team { id: string; name: string; members?: string[]; }
export interface MeshStatus { peerCount: number; peers: Array<{ id: string; addr?: string }>; }
export interface CodeBlock { id: string; code: string; language: string; createdAt: string; }
export interface Proposal { id: string; title: string; description: string; status: string; }
export interface VmHandle { vmId: string; endpoint?: string; }

export interface BuckyClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export function createBuckyClient(opts: BuckyClientOptions = {}) {
  const baseUrl = opts.baseUrl ?? process.env.DIRGHA_BUCKY_URL ?? 'http://localhost:3002';
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const req = <T>(options: { method?: 'GET' | 'POST' | 'DELETE' | 'PATCH'; path: string; body?: unknown; token?: string; query?: Record<string, string | number | boolean | undefined> }): Promise<T> =>
    jsonRequest<T>({ baseUrl, timeoutMs, ...options });

  return {
    tasks: {
      list(token?: string): Promise<{ tasks: BuckyTask[] }> {
        return req({ method: 'GET', path: '/api/tasks', token });
      },
      submit(payload: unknown, token?: string): Promise<BuckyTask> {
        return req({ method: 'POST', path: '/api/tasks', body: payload, token });
      },
    },
    dao: {
      listTeams(token?: string): Promise<{ teams: Team[] }> {
        return req({ method: 'GET', path: '/api/dao/teams', token });
      },
      getTeam(id: string, token?: string): Promise<Team> {
        return req({ method: 'GET', path: `/api/dao/teams/${encodeURIComponent(id)}`, token });
      },
    },
    mesh: {
      status(token?: string): Promise<MeshStatus> {
        return req({ method: 'GET', path: '/api/mesh/status', token });
      },
    },
    lightning: {
      balance(token?: string): Promise<{ sats: number }> {
        return req({ method: 'GET', path: '/api/lightning/balance', token });
      },
    },
    reputation: {
      get(userId: string, token?: string): Promise<{ userId: string; score: number }> {
        return req({ method: 'GET', path: `/api/reputation/${encodeURIComponent(userId)}`, token });
      },
    },
    code: {
      register(code: string, language: string, token?: string): Promise<{ id: string }> {
        return req({ method: 'POST', path: '/code/register', body: { code, language }, token });
      },
      get(id: string, token?: string): Promise<CodeBlock> {
        return req({ method: 'GET', path: `/code/${encodeURIComponent(id)}`, token });
      },
      list(token?: string): Promise<{ blocks: CodeBlock[] }> {
        return req({ method: 'GET', path: '/code', token });
      },
    },
    governance: {
      propose(proposal: Partial<Proposal> & { proposer: string; title: string }, token?: string): Promise<Proposal> {
        return req({ method: 'POST', path: '/governance/propose', body: proposal, token });
      },
      vote(vote: { proposalId: string; voterId: string; balance: number; direction: 'yes' | 'no' }, token?: string): Promise<{ ok: boolean }> {
        return req({ method: 'POST', path: '/governance/vote', body: vote, token });
      },
      list(token?: string): Promise<{ proposals: Proposal[] }> {
        return req({ method: 'GET', path: '/governance/proposals', token });
      },
    },
    vm: {
      create(cpuCount: number, memoryMB: number, token?: string): Promise<VmHandle> {
        return req({ method: 'POST', path: '/vm/create', body: { cpuCount, memoryMB }, token });
      },
      destroy(vmId: string, token?: string): Promise<{ ok: boolean }> {
        return req({ method: 'DELETE', path: `/vm/${encodeURIComponent(vmId)}`, token });
      },
    },
  };
}

export type BuckyClient = ReturnType<typeof createBuckyClient>;
