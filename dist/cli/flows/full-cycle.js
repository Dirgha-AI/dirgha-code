/**
 * Full-cycle command composition: plan → implement → security scan →
 * (optional) code register → deploy → stream logs. Each step is
 * pluggable; callers may skip or short-circuit individual phases.
 */
import { buildTarball } from './tarball.js';
export async function runFullCycle(opts) {
    const phase = (p, detail) => { opts.onPhase?.(p, detail); };
    let scan;
    if (opts.arniko) {
        phase('security', 'running Arniko scan');
        scan = await opts.arniko.scanPath(opts.cwd);
        if (!scan.passed && (opts.securityGate ?? 'block') === 'block') {
            return { aborted: true, reason: 'security scan failed; aborting full cycle', scan };
        }
    }
    let registeredBlockId;
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
    }
    catch { /* stream may close early; verdict captured below */ }
    phase('done', deployment.url ? `deployment ready at ${deployment.url}` : 'deployment complete');
    return { deployment, scan, registeredBlockId, aborted: false };
}
//# sourceMappingURL=full-cycle.js.map