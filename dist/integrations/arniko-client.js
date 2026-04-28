/**
 * Arniko security scanner client. Supports code scans by string,
 * directory path, or git diff. When the service is unreachable, the
 * bootstrap() entry attempts to bring up the docker-compose file that
 * ships in the user's `~/.dirgha/arniko/` directory.
 */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { jsonRequest, IntegrationError } from './http.js';
export function createArnikoClient(opts = {}) {
    const baseUrl = opts.baseUrl ?? process.env.DIRGHA_ARNIKO_URL ?? 'http://localhost:3010';
    const timeoutMs = opts.timeoutMs ?? 60_000;
    return {
        async isAvailable() {
            try {
                await jsonRequest({ baseUrl, path: '/healthz', timeoutMs: 2000 });
                return true;
            }
            catch {
                return false;
            }
        },
        async scanCode(code, taskId) {
            return jsonRequest({
                baseUrl,
                path: '/api/arniko/scans',
                method: 'POST',
                body: {
                    tools: ['semgrep', 'trufflehog'],
                    target: { type: 'code', identifier: taskId ?? 'inline', metadata: { code } },
                },
                timeoutMs,
            });
        },
        async scanPath(path, scanOpts = {}) {
            const abs = resolve(path);
            const info = await stat(abs).catch(() => undefined);
            if (!info)
                throw new IntegrationError(`Path does not exist: ${path}`);
            return jsonRequest({
                baseUrl,
                path: '/api/arniko/scans',
                method: 'POST',
                body: {
                    tools: scanOpts.tools ?? ['semgrep', 'trufflehog'],
                    target: { type: 'path', identifier: abs, metadata: {} },
                },
                timeoutMs,
            });
        },
        async scanDiff(diffPath, diffOpts = {}) {
            const diff = await readFile(diffPath, 'utf8');
            return jsonRequest({
                baseUrl,
                path: '/api/arniko/scans',
                method: 'POST',
                body: {
                    tools: diffOpts.tools ?? ['semgrep', 'trufflehog'],
                    target: { type: 'diff', identifier: diffPath, metadata: { diff } },
                },
                timeoutMs,
            });
        },
        async bootstrap(composePath) {
            return new Promise(resolveBootstrap => {
                const child = spawn('docker', ['compose', '-f', composePath, 'up', '-d'], { stdio: 'pipe' });
                const errChunks = [];
                child.stderr.on('data', (b) => errChunks.push(b));
                child.on('error', err => resolveBootstrap({ started: false, message: err.message }));
                child.on('exit', code => resolveBootstrap({
                    started: code === 0,
                    message: code === 0 ? 'docker compose up -d exited 0' : Buffer.concat(errChunks).toString('utf8'),
                }));
            });
        },
        summarise(result) {
            const counts = { critical: 0, high: 0, medium: 0, low: 0 };
            for (const f of result.findings)
                counts[f.severity]++;
            const verdict = result.passed ? 'PASS' : 'FAIL';
            return `security: ${verdict} · maturity=${result.maturityScore.toFixed(2)} · C=${counts.critical} H=${counts.high} M=${counts.medium} L=${counts.low}`;
        },
    };
}
//# sourceMappingURL=arniko-client.js.map