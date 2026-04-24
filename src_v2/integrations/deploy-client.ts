/**
 * Dirgha Deploy client. Talks to the gateway deploy routes (port 3001
 * in development, api.dirgha.ai in production). Supports project CRUD,
 * deployment trigger + rollback, a CLI tarball upload endpoint, and a
 * Server-Sent-Events log stream.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { jsonRequest, sseRequest, IntegrationError } from './http.js';

export interface Project {
  id: string;
  name: string;
  provider: string;
  region: string;
  domains: string[];
  createdAt: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  status: 'queued' | 'building' | 'ready' | 'failed' | 'rolled_back';
  url?: string;
  commitSha?: string;
  createdAt: string;
}

export interface DeployClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export function createDeployClient(opts: DeployClientOptions = {}) {
  const baseUrl = opts.baseUrl ?? process.env.DIRGHA_GATEWAY_URL ?? 'https://api.dirgha.ai';
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const req = <T>(options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown; token: string }): Promise<T> =>
    jsonRequest<T>({ baseUrl, timeoutMs, ...options });

  return {
    projects: {
      list(token: string): Promise<{ projects: Project[] }> {
        return req({ method: 'GET', path: '/api/deploy/projects', token });
      },
      create(project: Partial<Project> & { name: string }, token: string): Promise<Project> {
        return req({ method: 'POST', path: '/api/deploy/projects', body: project, token });
      },
      get(id: string, token: string): Promise<Project> {
        return req({ method: 'GET', path: `/api/deploy/projects/${encodeURIComponent(id)}`, token });
      },
      update(id: string, patch: Partial<Project>, token: string): Promise<Project> {
        return req({ method: 'PATCH', path: `/api/deploy/projects/${encodeURIComponent(id)}`, body: patch, token });
      },
      remove(id: string, token: string): Promise<{ ok: boolean }> {
        return req({ method: 'DELETE', path: `/api/deploy/projects/${encodeURIComponent(id)}`, token });
      },
    },
    deployments: {
      list(projectId: string, token: string): Promise<{ deployments: Deployment[] }> {
        return req({ method: 'GET', path: `/api/deploy/projects/${encodeURIComponent(projectId)}/deployments`, token });
      },
      trigger(projectId: string, input: { commitSha: string; commitMessage: string }, token: string): Promise<Deployment> {
        return req({ method: 'POST', path: `/api/deploy/projects/${encodeURIComponent(projectId)}/deploy`, body: input, token });
      },
      rollback(projectId: string, deploymentId: string, token: string): Promise<Deployment> {
        return req({ method: 'POST', path: `/api/deploy/projects/${encodeURIComponent(projectId)}/rollback`, body: { deploymentId }, token });
      },
      async *logs(deploymentId: string, token: string): AsyncIterable<{ ts: string; stream: 'stdout' | 'stderr' | 'system'; line: string }> {
        const stream = await sseRequest({
          baseUrl,
          path: `/api/deployments/${encodeURIComponent(deploymentId)}/logs`,
          token,
        });
        for await (const payload of stream) {
          try {
            yield JSON.parse(payload) as { ts: string; stream: 'stdout' | 'stderr' | 'system'; line: string };
          } catch {
            yield { ts: new Date().toISOString(), stream: 'system', line: payload };
          }
        }
      },
    },
    cli: {
      async upload(projectId: string, tarballPath: string, token: string): Promise<Deployment> {
        const info = await stat(tarballPath).catch(() => undefined);
        if (!info) throw new IntegrationError(`Tarball not found: ${tarballPath}`);
        const url = new URL(`${baseUrl.replace(/\/+$/, '')}/api/deploy/cli`);
        url.searchParams.set('projectId', projectId);
        const file = createReadStream(tarballPath);
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/gzip',
            'Content-Length': String(info.size),
            'X-Tarball-Name': basename(tarballPath),
          },
          body: file as unknown as ReadableStream,
          duplex: 'half',
        } as unknown as RequestInit);
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new IntegrationError(`Upload failed: HTTP ${response.status} ${body}`, response.status);
        }
        return await response.json() as Deployment;
      },
    },
  };
}

export type DeployClient = ReturnType<typeof createDeployClient>;
