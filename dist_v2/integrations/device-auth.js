/**
 * Device-code OAuth flow for the Dirgha gateway.
 *
 * Companion to `auth.ts` (which uses `~/.dirgha/auth.json` + the `/api/auth/cli/*`
 * routes). This module implements the legacy v1 token shape used by the rest
 * of the billing stack: `~/.dirgha/credentials.json` + `/api/auth/device/*`.
 *
 * The slash commands `login`, `account`, `upgrade` call this module. Keep the
 * public surface stable.
 */
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
const DEFAULT_API_BASE = 'https://api.dirgha.ai';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 15 * 60 * 1_000;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
function resolveApiBase(apiBase) {
    const raw = apiBase ?? process.env.DIRGHA_API_BASE ?? DEFAULT_API_BASE;
    return raw.replace(/\/+$/, '');
}
function credentialsPath() {
    return join(homedir(), '.dirgha', 'credentials.json');
}
function redact(err) {
    const message = err instanceof Error ? err.message : String(err);
    return message.replace(/Bearer\s+[\w.\-]+/gi, 'Bearer [REDACTED]');
}
export async function startDeviceAuth(apiBase) {
    const base = resolveApiBase(apiBase);
    let response;
    try {
        response = await fetch(`${base}/api/auth/device/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ client_id: 'dirgha-cli' }),
        });
    }
    catch (err) {
        throw new Error(`device/start request failed: ${redact(err)}`);
    }
    if (!response.ok) {
        throw new Error(`device/start failed: HTTP ${response.status}`);
    }
    const data = (await response.json());
    const deviceCode = data.device_code;
    const userCode = data.user_code;
    const verifyUri = data.verification_uri ?? data.verification_url;
    if (!deviceCode || !userCode || !verifyUri) {
        throw new Error('device/start returned malformed payload');
    }
    return {
        deviceCode,
        userCode,
        verifyUri,
        interval: (data.interval ?? 5) * 1_000,
        expiresIn: (data.expires_in ?? 900) * 1_000,
    };
}
export async function pollDeviceAuth(deviceCode, apiBase, opts = {}) {
    const base = resolveApiBase(apiBase);
    const intervalMs = opts.intervalMs ?? POLL_INTERVAL_MS;
    const deadline = Date.now() + (opts.timeoutMs ?? POLL_TIMEOUT_MS);
    while (Date.now() < deadline) {
        let response;
        try {
            response = await fetch(`${base}/api/auth/device/poll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ device_code: deviceCode }),
            });
        }
        catch (err) {
            // Network blip — keep polling
            await sleep(intervalMs);
            if (Date.now() >= deadline)
                throw new Error(`device/poll network error: ${redact(err)}`);
            continue;
        }
        if (response.status === 410)
            throw new Error('device code expired');
        if (response.status === 403)
            throw new Error('device code denied');
        if (response.ok) {
            const data = (await response.json());
            if (data.status === 'authorized' && data.token) {
                return {
                    token: data.token,
                    userId: data.user?.id ?? 'unknown',
                    email: data.user?.email ?? 'unknown',
                };
            }
            if (data.status === 'denied')
                throw new Error('device code denied');
            if (data.status === 'expired')
                throw new Error('device code expired');
        }
        else if (response.status !== 202 && response.status !== 425 && response.status !== 428) {
            throw new Error(`device/poll failed: HTTP ${response.status}`);
        }
        await sleep(intervalMs);
    }
    throw new Error('device/poll timed out');
}
export async function saveToken(token, userId, email) {
    const path = credentialsPath();
    await mkdir(dirname(path), { recursive: true });
    const payload = {
        token,
        userId,
        email,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    };
    await writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
    try {
        await chmod(path, 0o600);
    }
    catch { /* chmod may fail on Windows */ }
}
export async function loadToken() {
    const path = credentialsPath();
    const text = await readFile(path, 'utf8').catch(() => undefined);
    if (!text)
        return null;
    try {
        const parsed = JSON.parse(text);
        if (!parsed.token || !parsed.expiresAt)
            return null;
        if (Date.parse(parsed.expiresAt) <= Date.now())
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
export async function clearToken() {
    const path = credentialsPath();
    await unlink(path).catch(() => undefined);
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=device-auth.js.map