/**
 * `dirgha setup --features` — optional native feature installer.
 *
 * Installs:
 *   - better-sqlite3  (chat history + search)
 *   - qmd binary      (semantic doc search, vendored — reports absence only)
 *
 * Uses only Node built-ins: https module for downloads, zlib + tar parsing
 * for extraction. No new npm dependencies.
 *
 * Dispatch: called from `runSetup()` in setup.ts when `--features` is present.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdirSync, createWriteStream, existsSync, renameSync, unlinkSync } from 'node:fs';
import { access, constants, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createGunzip } from 'node:zlib';
import * as https from 'node:https';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const _require = createRequire(import.meta.url);
/** Resolve the package root of this CLI install (where package.json lives). */
function pkgRoot() {
    try {
        return dirname(_require.resolve('../../package.json'));
    }
    catch {
        // Fallback: walk up from this file's dist location.
        return join(dirname(new URL(import.meta.url).pathname), '..', '..');
    }
}
/** Download a URL to a file path, resolving redirects. Returns the HTTP status. */
function httpsDownload(url, destPath) {
    return new Promise((resolve, reject) => {
        function follow(u, redirects) {
            if (redirects > 5) {
                reject(new Error('Too many redirects'));
                return;
            }
            https.get(u, (res) => {
                if (res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    follow(res.headers.location, redirects + 1);
                    return;
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    resolve(res.statusCode ?? 0);
                    return;
                }
                const ws = createWriteStream(destPath);
                res.pipe(ws);
                ws.on('finish', () => resolve(200));
                ws.on('error', reject);
                res.on('error', reject);
            }).on('error', reject);
        }
        follow(url, 0);
    });
}
/**
 * Extract a single .node file from a tar.gz archive.
 * Uses `tar` CLI if available; otherwise falls back to a streaming zlib+manual
 * tar-header parse that handles GNU/POSIX ustar format (512-byte records).
 */
async function extractNodeFromTarGz(tarGzPath, outDir) {
    // Try system tar first (far simpler and handles edge cases).
    const tarResult = spawnSync('tar', ['-xzf', tarGzPath, '--wildcards', '*.node', '-C', outDir], {
        encoding: 'utf8',
        timeout: 30_000,
    });
    if (tarResult.status === 0) {
        // Find extracted .node file.
        const { readdirSync } = await import('node:fs');
        function findNode(dir) {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = join(dir, entry.name);
                if (entry.isDirectory()) {
                    const found = findNode(full);
                    if (found)
                        return found;
                }
                else if (entry.name.endsWith('.node')) {
                    return full;
                }
            }
            return null;
        }
        return findNode(outDir);
    }
    // Fallback: streaming zlib parse.
    return new Promise((resolve, reject) => {
        const { createReadStream } = require('node:fs');
        const gunzip = createGunzip();
        const rs = createReadStream(tarGzPath);
        const chunks = [];
        rs.pipe(gunzip);
        gunzip.on('data', (chunk) => chunks.push(chunk));
        gunzip.on('end', () => {
            const buf = Buffer.concat(chunks);
            let offset = 0;
            let foundPath = null;
            while (offset + 512 <= buf.length) {
                const header = buf.slice(offset, offset + 512);
                const nameRaw = header.slice(0, 100).toString('utf8').replace(/\0/g, '');
                const prefixRaw = header.slice(345, 500).toString('utf8').replace(/\0/g, '');
                const name = prefixRaw ? `${prefixRaw}/${nameRaw}` : nameRaw;
                const sizeOctal = header.slice(124, 136).toString('utf8').replace(/\0/g, '').trim();
                const size = sizeOctal ? parseInt(sizeOctal, 8) : 0;
                offset += 512;
                if (!name || size === 0) {
                    // Skip padding blocks.
                    continue;
                }
                if (name.endsWith('.node')) {
                    const fileData = buf.slice(offset, offset + size);
                    const outFile = join(outDir, 'better_sqlite3.node');
                    require('node:fs').writeFileSync(outFile, fileData);
                    foundPath = outFile;
                }
                // Advance past file content (rounded up to 512-byte boundary).
                offset += Math.ceil(size / 512) * 512;
            }
            resolve(foundPath);
        });
        gunzip.on('error', reject);
        rs.on('error', reject);
    });
}
async function detectFeatures() {
    // SQLite: try to require better-sqlite3.
    let sqliteAvailable = false;
    try {
        require('better-sqlite3');
        sqliteAvailable = true;
    }
    catch {
        // Not available or native addon missing.
    }
    // qmd: check vendored binary path.
    const platform = `${process.platform}-${process.arch}`;
    const qmdBin = join(pkgRoot(), 'vendor', 'qmd', platform, process.platform === 'win32' ? 'qmd.exe' : 'qmd');
    let qmdAvailable = false;
    try {
        await access(qmdBin, constants.X_OK);
        qmdAvailable = true;
    }
    catch {
        // Not vendored for this platform.
    }
    return { sqliteAvailable, qmdAvailable };
}
// ---------------------------------------------------------------------------
// better-sqlite3 installer
// ---------------------------------------------------------------------------
/** Read the better-sqlite3 version from the installed package.json. */
function getSqliteVersion() {
    try {
        const pkg = _require('better-sqlite3/package.json');
        if (typeof pkg.version === 'string')
            return pkg.version;
    }
    catch { /* fall through */ }
    // Read from our own optionalDependencies.
    try {
        const ownPkg = _require('../../package.json');
        const ver = ownPkg.optionalDependencies?.['better-sqlite3'];
        if (ver)
            return ver.replace(/^[^0-9]*/, '');
    }
    catch { /* fall through */ }
    return '12.9.0';
}
/** Find the better-sqlite3 node_modules directory. */
function findBetterSqlite3Dir() {
    try {
        const pkgJson = _require.resolve('better-sqlite3/package.json');
        return dirname(pkgJson);
    }
    catch {
        return null;
    }
}
async function installSqlitePrebuilt() {
    const version = getSqliteVersion();
    const nodeModulesVer = process.versions.modules;
    const platform = process.platform; // linux, darwin, win32
    const arch = process.arch; // x64, arm64
    // Map process.platform to GitHub release platform tag.
    const platformMap = {
        linux: 'linux',
        darwin: 'darwin',
        win32: 'win32',
    };
    const platTag = platformMap[platform] ?? platform;
    const tarName = `better-sqlite3-v${version}-node-v${nodeModulesVer}-${platTag}-${arch}.tar.gz`;
    const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/${tarName}`;
    stdout.write(`    Downloading prebuilt binary…\n`);
    stdout.write(`    ${url}\n`);
    const tmpDir = await mkdtemp(join(tmpdir(), 'dirgha-sqlite-'));
    const tarPath = join(tmpDir, tarName);
    let status;
    try {
        status = await httpsDownload(url, tarPath);
    }
    catch (err) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => { });
        return {
            ok: false,
            reason: `Download failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
    if (status === 404) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => { });
        return { ok: false, reason: 'Prebuilt binary not available for this platform/Node version.' };
    }
    if (status !== 200) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => { });
        return { ok: false, reason: `HTTP ${status} downloading prebuilt binary.` };
    }
    stdout.write(`    Extracting…\n`);
    const extractDir = join(tmpDir, 'extracted');
    mkdirSync(extractDir, { recursive: true });
    let nodePath;
    try {
        nodePath = await extractNodeFromTarGz(tarPath, extractDir);
    }
    catch (err) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => { });
        return {
            ok: false,
            reason: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
    if (!nodePath) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => { });
        return { ok: false, reason: 'No .node file found in prebuilt tarball.' };
    }
    // Place the .node file where better-sqlite3 expects it.
    const sqliteDir = findBetterSqlite3Dir();
    if (!sqliteDir) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => { });
        return {
            ok: false,
            reason: 'better-sqlite3 package directory not found. Run: npm install -g better-sqlite3',
        };
    }
    const releaseDir = join(sqliteDir, 'build', 'Release');
    mkdirSync(releaseDir, { recursive: true });
    const dest = join(releaseDir, 'better_sqlite3.node');
    try {
        // Rename is atomic on POSIX; on Windows just overwrite.
        if (existsSync(dest))
            unlinkSync(dest);
        renameSync(nodePath, dest);
    }
    catch {
        // rename across devices fails — try copy.
        try {
            const data = require('node:fs').readFileSync(nodePath);
            require('node:fs').writeFileSync(dest, data);
        }
        catch (cpErr) {
            await rm(tmpDir, { recursive: true, force: true }).catch(() => { });
            return {
                ok: false,
                reason: `Failed to place .node file: ${cpErr instanceof Error ? cpErr.message : String(cpErr)}`,
            };
        }
    }
    await rm(tmpDir, { recursive: true, force: true }).catch(() => { });
    return { ok: true };
}
async function installSqliteViaFallback() {
    if (process.platform === 'win32') {
        return { ok: false, reason: 'windows-guide', windowsGuide: true };
    }
    stdout.write(`    Running: npm install -g better-sqlite3\n`);
    try {
        await execFileAsync('npm', ['install', '-g', 'better-sqlite3'], {
            timeout: 120_000,
            env: { ...process.env },
        });
        return { ok: true };
    }
    catch (err) {
        return {
            ok: false,
            reason: `npm install failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
function printWindowsGuide() {
    stdout.write(`  ✗ Prebuilt binary not available for your Node version.\n\n` +
        `  Windows requires Visual Studio Build Tools to compile SQLite.\n` +
        `  This is a one-time setup that all Windows developers need.\n\n` +
        `  Steps:\n` +
        `    1. Download: https://aka.ms/vs/17/release/vs_BuildTools.exe\n` +
        `    2. Run installer → select "Desktop development with C++"\n` +
        `    3. Under "Optional": check "Windows 10/11 SDK"\n` +
        `    4. Install (~4 GB), restart terminal\n` +
        `    5. Re-run: dirgha setup --features\n\n` +
        `  After installing, SQLite compiles automatically.\n` +
        `  Chat history and search will be enabled.\n`);
}
async function installSqlite() {
    // Step 1: try prebuilt.
    const prebuilt = await installSqlitePrebuilt();
    if (prebuilt.ok)
        return true;
    stdout.write(`    Prebuilt not available (${prebuilt.reason}). Trying fallback…\n`);
    // Step 2: fallback (npm install on POSIX, or Windows guide).
    const fallback = await installSqliteViaFallback();
    if (!fallback.ok) {
        if (fallback.windowsGuide) {
            printWindowsGuide();
        }
        else {
            stdout.write(`  ✗ Install failed: ${fallback.reason}\n`);
        }
        return false;
    }
    return true;
}
/** Verify SQLite works after install by attempting to require it. */
function verifySqlite() {
    try {
        // Clear any cached failed module attempt.
        // (require cache won't have a successful entry if the .node was missing)
        const id = 'better-sqlite3';
        // Delete from require cache so the updated .node is picked up.
        try {
            delete require.cache[_require.resolve(id)];
        }
        catch { /* resolve may fail if not installed */ }
        _require(id);
        return true;
    }
    catch {
        return false;
    }
}
// ---------------------------------------------------------------------------
// Main interactive flow
// ---------------------------------------------------------------------------
export async function runFeatureSetup() {
    // Non-TTY: just print status and exit cleanly.
    if (!stdin.isTTY) {
        stdout.write('dirgha feature installer\n');
        stdout.write('Run this command in an interactive terminal.\n');
        return 0;
    }
    const rl = createInterface({ input: stdin, output: stdout });
    try {
        stdout.write('\nDirgha feature installer\n');
        stdout.write('─'.repeat(24) + '\n\n');
        stdout.write('Checking optional features…\n\n');
        const status = await detectFeatures();
        const sqliteMark = status.sqliteAvailable ? '✓' : '○';
        const qmdMark = status.qmdAvailable ? '✓' : '○';
        stdout.write(`  ${sqliteMark} better-sqlite3    chat history + search\n`);
        stdout.write(`  ${qmdMark} qmd binary        semantic doc search\n`);
        stdout.write('\n');
        // If everything is already working, just report and exit.
        if (status.sqliteAvailable && status.qmdAvailable) {
            stdout.write('All features are already installed.\n\n');
            stdout.write('Run `dirgha doctor` to verify your setup.\n');
            return 0;
        }
        // Build menu based on what's missing.
        const missingSqlite = !status.sqliteAvailable;
        stdout.write('Install optional features?\n');
        let choice;
        if (missingSqlite) {
            stdout.write('  [1] All features\n');
            stdout.write('  [2] SQLite only (chat history + search)\n');
            stdout.write('  [3] Skip\n\n');
            choice = (await rl.question('Choice [1/2/3]: ')).trim();
        }
        else {
            // SQLite already installed, nothing else to install automatically.
            stdout.write('  [1] Install remaining features\n');
            stdout.write('  [2] Skip\n\n');
            choice = (await rl.question('Choice [1/2]: ')).trim() === '1' ? '1' : '3';
        }
        if (choice === '3' || choice.toLowerCase() === 's' || choice === '2' && !missingSqlite) {
            stdout.write('\nSkipped. No changes made.\n');
            return 0;
        }
        const installSqliteNow = missingSqlite && (choice === '1' || choice === '2');
        stdout.write('\n');
        // Track results for summary.
        let sqliteOk = status.sqliteAvailable;
        const qmdOk = status.qmdAvailable;
        // ── better-sqlite3 ──────────────────────────────────────────────────
        if (installSqliteNow) {
            stdout.write('► installing better-sqlite3…\n');
            const ok = await installSqlite();
            if (ok) {
                // Verify it actually loads.
                const verified = verifySqlite();
                if (verified) {
                    stdout.write(`  ✓ better-sqlite3 installed successfully\n`);
                    sqliteOk = true;
                }
                else {
                    stdout.write(`  ✗ better-sqlite3 was placed but could not be loaded.\n`);
                    stdout.write(`    Try: npm install -g better-sqlite3\n`);
                }
            }
            // If !ok, the individual installer already printed the reason.
        }
        // ── qmd binary ──────────────────────────────────────────────────────
        if (!qmdOk) {
            stdout.write(`  ○ qmd binary not bundled in this release.\n`);
            stdout.write(`    Semantic search unavailable until the next release.\n`);
        }
        // ── Summary ─────────────────────────────────────────────────────────
        stdout.write('\nSetup complete.\n\n');
        const sqliteSummary = sqliteOk ? 'chat history enabled' : 'not installed';
        const qmdSummary = qmdOk ? 'available' : 'not available yet';
        stdout.write(`  ${sqliteOk ? '✓' : '○'} better-sqlite3    ${sqliteSummary}\n`);
        stdout.write(`  ${qmdOk ? '✓' : '○'} qmd binary        ${qmdSummary}\n`);
        stdout.write('\nRun `dirgha doctor` to verify your setup.\n');
        return 0;
    }
    finally {
        rl.close();
    }
}
//# sourceMappingURL=feature-setup.js.map