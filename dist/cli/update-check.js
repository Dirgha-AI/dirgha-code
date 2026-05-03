/**
 * Startup update check — fire-and-forget, non-blocking.
 *
 * Checks npm registry for a newer @dirgha/code version and prints
 * a notice on stderr when one is available. Does NOT block launch.
 *
 * Cache: writes ~/.dirgha/.last-update-check to avoid checking more
 * than once every 6 hours.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_FILE = join(homedir(), ".dirgha", ".last-update-check");
function shouldCheck() {
    try {
        if (!existsSync(CACHE_FILE))
            return true;
        const ts = parseInt(readFileSync(CACHE_FILE, "utf8").trim(), 10);
        if (isNaN(ts))
            return true;
        return Date.now() - ts > CHECK_INTERVAL_MS;
    }
    catch {
        return true;
    }
}
function markChecked() {
    try {
        mkdirSync(join(homedir(), ".dirgha"), { recursive: true });
        writeFileSync(CACHE_FILE, String(Date.now()), "utf8");
    }
    catch {
        /* ignore */
    }
}
export async function checkStartupUpdate(currentVersion) {
    if (!shouldCheck())
        return;
    try {
        const latest = await fetchLatestVersion();
        if (!latest || !isSemverNewer(latest, currentVersion))
            return;
        process.stderr.write(`\n📦 @dirgha/code ${latest} is available (you have ${currentVersion})\n` +
            `   Run: npm i -g @dirgha/code@latest\n` +
            `   Or type /update in the REPL\n\n`);
    }
    catch {
        /* network error — silent */
    }
    markChecked();
}
async function fetchLatestVersion() {
    try {
        const res = await fetch("https://registry.npmjs.org/@dirgha/code/latest", {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok)
            return null;
        const data = (await res.json());
        return data.version ?? null;
    }
    catch {
        return null;
    }
}
export async function getUpdateBannerVersion(currentVersion) {
    if (!shouldCheck())
        return null;
    try {
        const latest = await fetchLatestVersion();
        if (!latest || !isSemverNewer(latest, currentVersion))
            return null;
        return latest;
    }
    catch {
        return null;
    }
    finally {
        markChecked();
    }
}
function isSemverNewer(latest, current) {
    try {
        const [lm, lmn, lp] = latest.split(".").map(Number);
        const [cm, cmn, cp] = current.split(".").map(Number);
        if (isNaN(lm) || isNaN(cm))
            return latest !== current; // non-semver — show if different
        if (lm !== cm)
            return lm > cm;
        if (lmn !== cmn)
            return lmn > cmn;
        if (lp !== cp)
            return lp > cp;
        return false; // equal
    }
    catch {
        return latest !== current;
    }
}
//# sourceMappingURL=update-check.js.map