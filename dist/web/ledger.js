// scope: S19c
import { readdir, readFile, stat, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename, extname } from "node:path";
function emptySummary() {
    return { scopes: [], totalEntries: 0, scopeCount: 0 };
}
export async function collectLedger(opts) {
    const ledgerDir = opts?.ledgerDir ?? join(homedir(), ".dirgha", "ledger");
    try {
        const st = await stat(ledgerDir);
        if (!st.isDirectory())
            return emptySummary();
    }
    catch {
        return emptySummary();
    }
    let files;
    try {
        files = await readdir(ledgerDir);
    }
    catch {
        return emptySummary();
    }
    const jsonlFiles = files.filter((f) => extname(f) === ".jsonl");
    const scopeSummaries = [];
    for (const file of jsonlFiles) {
        const scope = basename(file, ".jsonl");
        const filePath = join(ledgerDir, file);
        let content;
        try {
            content = await readFile(filePath, "utf8");
        }
        catch {
            continue;
        }
        const lines = content.split("\n").filter((l) => l.trim());
        const entries = [];
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                if (entry &&
                    typeof entry.ts === "string" &&
                    typeof entry.kind === "string" &&
                    typeof entry.text === "string") {
                    entries.push(entry);
                }
            }
            catch {
                /* ignore */
            }
        }
        if (entries.length === 0)
            continue;
        entries.sort((a, b) => b.ts.localeCompare(a.ts));
        const recent = entries.slice(0, 20);
        const entryCount = entries.length;
        const byKind = {};
        for (const entry of entries) {
            byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
        }
        const earliestTs = entries[entries.length - 1].ts;
        const latestTs = entries[0].ts;
        let digestExcerpt;
        const mdPath = join(ledgerDir, `${scope}.md`);
        try {
            const mdStat = await stat(mdPath);
            if (mdStat.isFile()) {
                let mdContent;
                if (mdStat.size < 8192) {
                    mdContent = await readFile(mdPath, "utf8");
                }
                else {
                    const fd = await open(mdPath, "r");
                    const buf = Buffer.alloc(500);
                    const { bytesRead } = await fd.read(buf, 0, 500, 0);
                    await fd.close();
                    mdContent = buf.slice(0, bytesRead).toString("utf8");
                }
                if (mdContent.length > 500) {
                    digestExcerpt = mdContent.slice(0, 500) + "…";
                }
                else {
                    digestExcerpt = mdContent;
                }
            }
        }
        catch {
            /* no md */
        }
        scopeSummaries.push({
            scope,
            entryCount,
            byKind,
            earliestTs,
            latestTs,
            recent,
            digestExcerpt,
        });
    }
    scopeSummaries.sort((a, b) => {
        if (a.latestTs && b.latestTs)
            return b.latestTs.localeCompare(a.latestTs);
        return 0;
    });
    const totalEntries = scopeSummaries.reduce((sum, s) => sum + s.entryCount, 0);
    return {
        scopes: scopeSummaries,
        totalEntries,
        scopeCount: scopeSummaries.length,
    };
}
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
export function renderLedgerPage(summary) {
    const { scopes, totalEntries, scopeCount } = summary;
    const title = `Dirgha Ledger — ${scopeCount} scopes, ${totalEntries} entries`;
    const nav = `<div class="nav"><a href="/">Audit</a> | <a href="/cost">Cost</a> | <a href="/ledger" class="active">Ledger</a></div>`;
    let body = nav;
    body += `<h1>${escapeHtml(title)}</h1>`;
    if (scopes.length === 0) {
        body += `<p>No ledger entries found.</p>`;
    }
    else {
        for (const scope of scopes) {
            const kindParts = Object.entries(scope.byKind).map(([kind, count]) => `${kind}×${count}`);
            const kindSummary = kindParts.join(", ");
            const h2 = `${scope.scope} — ${scope.entryCount} entries (${kindSummary})`;
            body += `<section><h2>${escapeHtml(h2)}</h2>`;
            if (scope.digestExcerpt) {
                body += `<pre>${escapeHtml(scope.digestExcerpt)}</pre>`;
            }
            if (scope.recent.length > 0) {
                body += `<table><thead><tr><th>Timestamp</th><th>Kind</th><th>Text</th></tr></thead><tbody>`;
                for (const entry of scope.recent) {
                    const ts = escapeHtml(entry.ts);
                    const kind = escapeHtml(entry.kind);
                    let text = entry.text;
                    if (text.length > 160)
                        text = text.slice(0, 160) + "…";
                    const textEscaped = escapeHtml(text);
                    body += `<tr><td>${ts}</td><td>${kind}</td><td>${textEscaped}</td></tr>`;
                }
                body += `</tbody></table>`;
            }
            body += `</section>`;
        }
    }
    const css = `
    body { background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 20px; }
    a { color: #569cd6; }
    a.active { color: #d4d4d4; text-decoration: none; font-weight: bold; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { border: 1px solid #444; padding: 6px 10px; text-align: left; font-size: 14px; }
    th { background: #2d2d2d; }
    tr:nth-child(even) { background: #252525; }
    pre { background: #252525; padding: 10px; overflow-x: auto; white-space: pre-wrap; font-size: 13px; }
    h1 { font-size: 24px; }
    h2 { font-size: 20px; margin-top: 30px; border-bottom: 1px solid #444; padding-bottom: 5px; }
    .nav { margin-bottom: 20px; font-size: 16px; }
  `;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;
}
//# sourceMappingURL=ledger.js.map