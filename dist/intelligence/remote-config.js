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
const CACHE_PATH = join(homedir(), ".dirgha", "remote-config.json");
const REFRESH_MS = 24 * 60 * 60 * 1000;
const DEFAULT_API_BASE = process.env["DIRGHA_API_BASE"] ??
    process.env["DIRGHA_GATEWAY_URL"] ??
    "https://api.dirgha.ai";
function isSemverNewer(latest, current) {
    try {
        const [lm, lmn, lp] = latest.split(".").map(Number);
        const [cm, cmn, cp] = current.split(".").map(Number);
        if (isNaN(lm) || isNaN(cm))
            return latest !== current;
        if (lm !== cm)
            return lm > cm;
        if (lmn !== cmn)
            return lmn > cmn;
        if (lp !== cp)
            return lp > cp;
        return false;
    }
    catch {
        return latest !== current;
    }
}
export async function fetchRemoteConfig() {
    try {
        const url = `${DEFAULT_API_BASE}/api/cli/config`;
        const res = await fetch(url, {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok)
            return null;
        const data = (await res.json());
        await mkdir(join(homedir(), ".dirgha"), { recursive: true });
        await writeFile(CACHE_PATH, JSON.stringify(data, null, 2), "utf8");
        return data;
    }
    catch {
        return null;
    }
}
export async function getCachedConfig() {
    try {
        const stat = await import("node:fs/promises").then((m) => m.stat(CACHE_PATH));
        const age = Date.now() - stat.mtimeMs;
        if (age > REFRESH_MS)
            return null;
        const raw = await readFile(CACHE_PATH, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/**
 * One-stop fetch: returns cached if fresh, otherwise fetches from
 * the gateway. Returns null if neither is available.
 */
export async function getRemoteConfig() {
    const cached = await getCachedConfig();
    if (cached)
        return cached;
    return fetchRemoteConfig();
}
export function isVersionBelowMin(current, minimum) {
    return isSemverNewer(minimum, current);
}
//# sourceMappingURL=remote-config.js.map