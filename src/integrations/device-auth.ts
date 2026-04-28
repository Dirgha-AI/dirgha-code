/**
 * Device-code OAuth flow for the Dirgha gateway.
 *
 * Canonical auth module. Stores tokens at `~/.dirgha/credentials.json`
 * (0600) and drives the `/api/auth/device/*` endpoints. The older
 * `integrations/auth.ts` is now a compatibility shim that delegates
 * here so the billing + entitlements stack has exactly one source of
 * truth for the active token.
 *
 * Callers:
 *   - Slash commands (`/login`, `/account`, `/upgrade`) via `loadToken()`.
 *   - CLI subcommands (`dirgha login`, `dirgha logout`).
 *   - Billing preflight (`preRequestCheck` reads the bearer).
 */

import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface DeviceAuthStart {
  userCode: string;
  verifyUri: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
}

export interface DeviceAuthResult {
  token: string;
  userId: string;
  email: string;
}

export interface Token {
  token: string;
  userId: string;
  email: string;
  expiresAt: string;
}

interface DeviceStartResponse {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  verification_url?: string;
  interval?: number;
  expires_in?: number;
}

interface DevicePollResponse {
  status?: 'pending' | 'authorized' | 'denied' | 'expired';
  token?: string;
  user?: { id?: string; email?: string };
}

const DEFAULT_API_BASE = 'https://api.dirgha.ai';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 15 * 60 * 1_000;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

function resolveApiBase(apiBase?: string): string {
  const raw = apiBase ?? process.env.DIRGHA_API_BASE ?? DEFAULT_API_BASE;
  return raw.replace(/\/+$/, '');
}

function credentialsPath(): string {
  return join(homedir(), '.dirgha', 'credentials.json');
}

function redact(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/Bearer\s+[\w.\-]+/gi, 'Bearer [REDACTED]');
}

export async function startDeviceAuth(apiBase?: string): Promise<DeviceAuthStart> {
  const base = resolveApiBase(apiBase);
  let response: Response;
  try {
    response = await fetch(`${base}/api/auth/device/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: 'dirgha-cli' }),
    });
  } catch (err) {
    throw new Error(`device/start request failed: ${redact(err)}`);
  }
  if (!response.ok) {
    throw new Error(`device/start failed: HTTP ${response.status}`);
  }
  const data = (await response.json()) as DeviceStartResponse;
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

export async function pollDeviceAuth(
  deviceCode: string,
  apiBase?: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<DeviceAuthResult> {
  const base = resolveApiBase(apiBase);
  const intervalMs = opts.intervalMs ?? POLL_INTERVAL_MS;
  const deadline = Date.now() + (opts.timeoutMs ?? POLL_TIMEOUT_MS);

  while (Date.now() < deadline) {
    let response: Response;
    try {
      response = await fetch(`${base}/api/auth/device/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
      });
    } catch (err) {
      // Network blip — keep polling
      await sleep(intervalMs);
      if (Date.now() >= deadline) throw new Error(`device/poll network error: ${redact(err)}`);
      continue;
    }

    if (response.status === 410) throw new Error('device code expired');
    if (response.status === 403) throw new Error('device code denied');

    if (response.ok) {
      const data = (await response.json()) as DevicePollResponse;
      if (data.status === 'authorized' && data.token) {
        return {
          token: data.token,
          userId: data.user?.id ?? 'unknown',
          email: data.user?.email ?? 'unknown',
        };
      }
      if (data.status === 'denied') throw new Error('device code denied');
      if (data.status === 'expired') throw new Error('device code expired');
    } else if (response.status !== 202 && response.status !== 425 && response.status !== 428) {
      throw new Error(`device/poll failed: HTTP ${response.status}`);
    }

    await sleep(intervalMs);
  }
  throw new Error('device/poll timed out');
}

export async function saveToken(token: string, userId: string, email: string): Promise<void> {
  const path = credentialsPath();
  await mkdir(dirname(path), { recursive: true });
  const payload: Token = {
    token,
    userId,
    email,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  };
  await writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
  try { await chmod(path, 0o600); } catch { /* chmod may fail on Windows */ }
}

export async function loadToken(): Promise<Token | null> {
  const path = credentialsPath();
  const text = await readFile(path, 'utf8').catch(() => undefined);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Token;
    if (!parsed.token || !parsed.expiresAt) return null;
    if (Date.parse(parsed.expiresAt) <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  const path = credentialsPath();
  await unlink(path).catch(() => undefined);
}

/**
 * One-shot migration from the legacy `~/.dirgha/auth.json` format
 * (`integrations/auth.ts`) to the canonical `credentials.json`. Safe to
 * call on every CLI start — returns `false` fast when nothing to do.
 *
 * Logs a single line to stderr on a successful move. Silent on no-op.
 */
export async function migrateLegacyAuth(): Promise<boolean> {
  const legacyPath = join(homedir(), '.dirgha', 'auth.json');
  const targetPath = credentialsPath();

  const legacyInfo = await stat(legacyPath).catch(() => undefined);
  if (!legacyInfo || !legacyInfo.isFile() || legacyInfo.size === 0) return false;
  const targetInfo = await stat(targetPath).catch(() => undefined);
  if (targetInfo && targetInfo.size > 0) return false;

  const text = await readFile(legacyPath, 'utf8').catch(() => undefined);
  if (!text) return false;

  let parsed: { jwt?: string; userId?: string; expiresAt?: string } | undefined;
  try { parsed = JSON.parse(text) as { jwt?: string; userId?: string; expiresAt?: string }; } catch { return false; }
  if (!parsed || !parsed.jwt) return false;

  await mkdir(dirname(targetPath), { recursive: true });
  const payload: Token = {
    token: parsed.jwt,
    userId: parsed.userId ?? 'unknown',
    email: 'unknown',
    expiresAt: parsed.expiresAt ?? new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  };
  await writeFile(targetPath, JSON.stringify(payload, null, 2), 'utf8');
  try { await chmod(targetPath, 0o600); } catch { /* non-POSIX */ }
  await rename(legacyPath, `${legacyPath}.migrated`).catch(() => undefined);
  process.stderr.write('[auth] migrated legacy credentials\n');
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
