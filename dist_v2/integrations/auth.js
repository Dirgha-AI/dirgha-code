/**
 * Device-code authentication flow for the gateway-issued JWT. The token
 * is stored at `~/.dirgha/auth.json` with 0600 permissions and cached
 * in memory for the lifetime of the process.
 */
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
export function createAuthClient(opts = {}) {
    const gateway = (opts.gatewayUrl ?? process.env.DIRGHA_GATEWAY_URL ?? 'https://api.dirgha.ai').replace(/\/+$/, '');
    const tokenPath = opts.tokenPath ?? join(homedir(), '.dirgha', 'auth.json');
    const pollInterval = opts.pollIntervalMs ?? 2000;
    const pollTimeout = opts.pollTimeoutMs ?? 10 * 60 * 1000;
    const openBrowser = opts.openBrowser ?? ((url) => { process.stdout.write(`Open in a browser to continue:\n${url}\n`); });
    return {
        async currentToken() {
            const text = await readFile(tokenPath, 'utf8').catch(() => undefined);
            if (!text)
                return undefined;
            try {
                const parsed = JSON.parse(text);
                if (!parsed.jwt || !parsed.expiresAt)
                    return undefined;
                if (Date.parse(parsed.expiresAt) <= Date.now())
                    return undefined;
                return parsed;
            }
            catch {
                return undefined;
            }
        },
        async login() {
            const { deviceCode, verifyUrl, interval } = await requestDeviceCode(gateway);
            openBrowser(verifyUrl);
            const token = await pollForToken(gateway, deviceCode, interval ?? pollInterval, pollTimeout);
            await persistToken(tokenPath, token);
            return token;
        },
        async logout() {
            const info = await stat(tokenPath).catch(() => undefined);
            if (!info)
                return;
            await writeFile(tokenPath, '', 'utf8');
        },
    };
}
async function requestDeviceCode(gateway) {
    const response = await fetch(`${gateway}/api/auth/cli/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: 'dirgha-cli' }),
    });
    if (!response.ok)
        throw new Error(`Device code request failed: HTTP ${response.status}`);
    const data = await response.json();
    return { deviceCode: data.device_code, verifyUrl: data.verification_url, interval: data.interval };
}
async function pollForToken(gateway, deviceCode, intervalMs, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const response = await fetch(`${gateway}/api/auth/cli/token/${encodeURIComponent(deviceCode)}`, { method: 'GET' });
        if (response.ok) {
            return await response.json();
        }
        if (response.status === 428 || response.status === 425 || response.status === 202) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
            continue;
        }
        if (response.status === 410)
            throw new Error('Device code expired. Please retry `dirgha auth login`.');
        throw new Error(`Token poll failed: HTTP ${response.status}`);
    }
    throw new Error('Device code poll timed out');
}
async function persistToken(path, token) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(token, null, 2), 'utf8');
    try {
        await chmod(path, 0o600);
    }
    catch { /* chmod may fail on Windows; ignore */ }
}
//# sourceMappingURL=auth.js.map