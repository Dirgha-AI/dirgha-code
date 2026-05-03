/**
 * Remote configuration fetched from the Dirgha gateway on startup.
 * Cached to ~/.dirgha/remote-config.json, refreshed every 24 hours.
 *
 * Sets:
 *   - Model picker default to recommendedModel if no explicit model set
 *   - Upgrade banner if current version < minimumVersion
 *   - MOTD shown once per session
 *   - Warnings for deprecated models
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface RemoteConfig {
  recommendedModel: string;
  recommendedFreeModel: string;
  minimumVersion: string;
  deprecatedModels: string[];
  providerDefaults: Record<string, string>;
  motd?: string;
}

const CACHE_PATH = join(homedir(), ".dirgha", "remote-config.json");
const REFRESH_MS = 24 * 60 * 60 * 1000;
const DEFAULT_API_BASE =
  process.env["DIRGHA_API_BASE"] ??
  process.env["DIRGHA_GATEWAY_URL"] ??
  "https://api.dirgha.ai";

function isSemverNewer(latest: string, current: string): boolean {
  try {
    const [lm, lmn, lp] = latest.split(".").map(Number);
    const [cm, cmn, cp] = current.split(".").map(Number);
    if (isNaN(lm as number) || isNaN(cm as number)) return latest !== current;
    if ((lm as number) !== (cm as number))
      return (lm as number) > (cm as number);
    if ((lmn as number) !== (cmn as number))
      return (lmn as number) > (cmn as number);
    if ((lp as number) !== (cp as number))
      return (lp as number) > (cp as number);
    return false;
  } catch {
    return latest !== current;
  }
}

export async function fetchRemoteConfig(): Promise<RemoteConfig | null> {
  try {
    const url = `${DEFAULT_API_BASE}/api/cli/config`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RemoteConfig;
    await mkdir(join(homedir(), ".dirgha"), { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(data, null, 2), "utf8");
    return data;
  } catch {
    return null;
  }
}

export async function getCachedConfig(): Promise<RemoteConfig | null> {
  try {
    const stat = await import("node:fs/promises").then((m) =>
      m.stat(CACHE_PATH),
    );
    const age = Date.now() - stat.mtimeMs;
    if (age > REFRESH_MS) return null;
    const raw = await readFile(CACHE_PATH, "utf8");
    return JSON.parse(raw) as RemoteConfig;
  } catch {
    return null;
  }
}

/**
 * One-stop fetch: returns cached if fresh, otherwise fetches from
 * the gateway. Returns null if neither is available.
 */
export async function getRemoteConfig(): Promise<RemoteConfig | null> {
  const cached = await getCachedConfig();
  if (cached) return cached;
  return fetchRemoteConfig();
}

export function isVersionBelowMin(current: string, minimum: string): boolean {
  return isSemverNewer(minimum, current);
}
