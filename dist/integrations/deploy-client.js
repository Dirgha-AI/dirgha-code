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
export function createDeployClient(opts = {}) {
    const baseUrl = opts.baseUrl ?? process.env.DIRGHA_GATEWAY_URL ?? 'https://api.dirgha.ai';
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const req = (options) => jsonRequest({ baseUrl, timeoutMs, ...options });
    return {
        projects: {
            list(token) {
                return req({ method: 'GET', path: '/api/deploy/projects', token });
            },
            create(project, token) {
                return req({ method: 'POST', path: '/api/deploy/projects', body: project, token });
            },
            get(id, token) {
                return req({ method: 'GET', path: `/api/deploy/projects/${encodeURIComponent(id)}`, token });
            },
            update(id, patch, token) {
                return req({ method: 'PATCH', path: `/api/deploy/projects/${encodeURIComponent(id)}`, body: patch, token });
            },
            remove(id, token) {
                return req({ method: 'DELETE', path: `/api/deploy/projects/${encodeURIComponent(id)}`, token });
            },
        },
        deployments: {
            list(projectId, token) {
                return req({ method: 'GET', path: `/api/deploy/projects/${encodeURIComponent(projectId)}/deployments`, token });
            },
            trigger(projectId, input, token) {
                return req({ method: 'POST', path: `/api/deploy/projects/${encodeURIComponent(projectId)}/deploy`, body: input, token });
            },
            rollback(projectId, deploymentId, token) {
                return req({ method: 'POST', path: `/api/deploy/projects/${encodeURIComponent(projectId)}/rollback`, body: { deploymentId }, token });
            },
            async *logs(deploymentId, token) {
                const stream = await sseRequest({
                    baseUrl,
                    path: `/api/deployments/${encodeURIComponent(deploymentId)}/logs`,
                    token,
                });
                for await (const payload of stream) {
                    try {
                        yield JSON.parse(payload);
                    }
                    catch {
                        yield { ts: new Date().toISOString(), stream: 'system', line: payload };
                    }
                }
            },
        },
        cli: {
            async upload(projectId, tarballPath, token) {
                const info = await stat(tarballPath).catch(() => undefined);
                if (!info)
                    throw new IntegrationError(`Tarball not found: ${tarballPath}`);
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
                    body: file,
                    duplex: 'half',
                });
                if (!response.ok) {
                    const body = await response.text().catch(() => '');
                    throw new IntegrationError(`Upload failed: HTTP ${response.status} ${body}`, response.status);
                }
                return await response.json();
            },
        },
    };
}
//# sourceMappingURL=deploy-client.js.map