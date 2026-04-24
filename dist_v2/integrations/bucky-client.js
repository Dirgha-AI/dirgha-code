/**
 * Bucky client. Thin wrapper over the Hono.js service (default port
 * 3002). All methods take an explicit bearer token argument so callers
 * can control scope (gateway passthrough vs anonymous for public
 * endpoints).
 */
import { jsonRequest } from './http.js';
export function createBuckyClient(opts = {}) {
    const baseUrl = opts.baseUrl ?? process.env.DIRGHA_BUCKY_URL ?? 'http://localhost:3002';
    const timeoutMs = opts.timeoutMs ?? 20_000;
    const req = (options) => jsonRequest({ baseUrl, timeoutMs, ...options });
    return {
        tasks: {
            list(token) {
                return req({ method: 'GET', path: '/api/tasks', token });
            },
            submit(payload, token) {
                return req({ method: 'POST', path: '/api/tasks', body: payload, token });
            },
        },
        dao: {
            listTeams(token) {
                return req({ method: 'GET', path: '/api/dao/teams', token });
            },
            getTeam(id, token) {
                return req({ method: 'GET', path: `/api/dao/teams/${encodeURIComponent(id)}`, token });
            },
        },
        mesh: {
            status(token) {
                return req({ method: 'GET', path: '/api/mesh/status', token });
            },
        },
        lightning: {
            balance(token) {
                return req({ method: 'GET', path: '/api/lightning/balance', token });
            },
        },
        reputation: {
            get(userId, token) {
                return req({ method: 'GET', path: `/api/reputation/${encodeURIComponent(userId)}`, token });
            },
        },
        code: {
            register(code, language, token) {
                return req({ method: 'POST', path: '/code/register', body: { code, language }, token });
            },
            get(id, token) {
                return req({ method: 'GET', path: `/code/${encodeURIComponent(id)}`, token });
            },
            list(token) {
                return req({ method: 'GET', path: '/code', token });
            },
        },
        governance: {
            propose(proposal, token) {
                return req({ method: 'POST', path: '/governance/propose', body: proposal, token });
            },
            vote(vote, token) {
                return req({ method: 'POST', path: '/governance/vote', body: vote, token });
            },
            list(token) {
                return req({ method: 'GET', path: '/governance/proposals', token });
            },
        },
        vm: {
            create(cpuCount, memoryMB, token) {
                return req({ method: 'POST', path: '/vm/create', body: { cpuCount, memoryMB }, token });
            },
            destroy(vmId, token) {
                return req({ method: 'DELETE', path: `/vm/${encodeURIComponent(vmId)}`, token });
            },
        },
    };
}
//# sourceMappingURL=bucky-client.js.map