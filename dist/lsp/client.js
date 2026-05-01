import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
// ── Symbol kind labels ─────────────────────────────────────────────────────
const SYMBOL_KIND_LABELS = {
    1: "File",
    2: "Module",
    3: "Namespace",
    4: "Package",
    5: "Class",
    6: "Method",
    7: "Property",
    8: "Field",
    9: "Constructor",
    10: "Enum",
    11: "Interface",
    12: "Function",
    13: "Variable",
    14: "Constant",
    15: "String",
    16: "Number",
    17: "Boolean",
    18: "Array",
    19: "Object",
    20: "Key",
    21: "Null",
    22: "EnumMember",
    23: "Struct",
    24: "Event",
    25: "Operator",
    26: "TypeParameter",
};
export function symbolKindLabel(kind) {
    return SYMBOL_KIND_LABELS[kind] ?? `Kind(${kind})`;
}
// ── JSON-RPC message framing ───────────────────────────────────────────────
class JsonRpcSplitter {
    buffer = "";
    transform(chunk) {
        this.buffer += chunk;
        const messages = [];
        while (true) {
            const headerEnd = this.buffer.indexOf("\r\n\r\n");
            if (headerEnd === -1)
                break;
            const header = this.buffer.slice(0, headerEnd);
            const match = header.match(/Content-Length: (\d+)/i);
            if (!match) {
                this.buffer = this.buffer.slice(headerEnd + 4);
                continue;
            }
            const contentLength = parseInt(match[1], 10);
            const bodyStart = headerEnd + 4;
            if (this.buffer.length < bodyStart + contentLength)
                break;
            const body = this.buffer.slice(bodyStart, bodyStart + contentLength);
            this.buffer = this.buffer.slice(bodyStart + contentLength);
            try {
                messages.push(JSON.parse(body));
            }
            catch {
                /* skip malformed */
            }
        }
        return messages;
    }
}
export function createLspConnection(proc) {
    const notificationHandlers = new Map();
    const pending = new Map();
    let nextId = 1;
    const splitter = new JsonRpcSplitter();
    function sendRaw(raw) {
        const header = `Content-Length: ${Buffer.byteLength(raw)}\r\n\r\n`;
        if (proc.stdin)
            proc.stdin.write(header + raw);
    }
    function handleMessage(msg) {
        if ("id" in msg && ("result" in msg || "error" in msg)) {
            const handler = pending.get(msg.id);
            if (handler) {
                pending.delete(msg.id);
                if (msg.error) {
                    handler.reject(new Error(msg.error.message));
                }
                else {
                    handler.resolve(msg.result);
                }
            }
            return;
        }
        if ("method" in msg && !("id" in msg)) {
            const handler = notificationHandlers.get(msg.method);
            if (handler)
                handler(msg.params);
        }
    }
    if (proc.stdout) {
        proc.stdout.on("data", (chunk) => {
            const messages = splitter.transform(chunk.toString("utf8"));
            for (const msg of messages)
                handleMessage(msg);
        });
    }
    return {
        sendRequest(method, params) {
            const id = nextId++;
            const request = JSON.stringify({ jsonrpc: "2.0", id, method, params });
            return new Promise((resolve, reject) => {
                pending.set(id, { resolve: resolve, reject });
                sendRaw(request);
            });
        },
        sendNotification(method, params) {
            sendRaw(JSON.stringify({ jsonrpc: "2.0", method, params }));
            return Promise.resolve();
        },
        onNotification(method, handler) {
            notificationHandlers.set(method, handler);
        },
        dispose() {
            pending.clear();
            notificationHandlers.clear();
            if (proc.stdout)
                proc.stdout.removeAllListeners("data");
        },
    };
}
const LSP_INIT_TIMEOUT = 30_000;
const LANGUAGE_MAP = {
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".py": "python",
    ".pyi": "python",
    ".rs": "rust",
    ".go": "go",
    ".json": "json",
    ".md": "markdown",
    ".css": "css",
    ".html": "html",
};
function uriToPath(uri) {
    if (uri.startsWith("file://")) {
        try {
            return new URL(uri).pathname;
        }
        catch {
            return uri;
        }
    }
    return uri;
}
export async function createLspClient(serverId, command, args, root, cwd) {
    const proc = spawn(command, args, {
        cwd: cwd || root,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
    });
    const connection = createLspConnection(proc);
    if (proc.stderr) {
        proc.stderr.resume();
    }
    if (proc.on) {
        proc.on("error", () => {
            /* handled by timeout */
        });
    }
    const diagnostics = new Map();
    connection.onNotification("textDocument/publishDiagnostics", (params) => {
        const p = params;
        const fpath = p.uri.startsWith("file://")
            ? new URL(p.uri).pathname
            : p.uri;
        diagnostics.set(fpath, p.diagnostics ?? []);
    });
    const initResult = await Promise.race([
        connection.sendRequest("initialize", {
            processId: proc.pid,
            rootUri: pathToFileURL(root).href,
            workspaceFolders: [{ name: "workspace", uri: pathToFileURL(root).href }],
            capabilities: {
                textDocument: {
                    synchronization: { didOpen: true, didChange: true },
                    definition: { linkSupport: true },
                    references: {},
                    hover: { contentFormat: ["plaintext", "markdown"] },
                    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
                    publishDiagnostics: {},
                },
                workspace: { configuration: true, workspaceFolders: true, symbol: {} },
            },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`LSP initialize timeout for ${serverId}`)), LSP_INIT_TIMEOUT)),
    ]);
    const capabilities = initResult.capabilities;
    await connection.sendNotification("initialized", {});
    await connection.sendNotification("workspace/didChangeConfiguration", {
        settings: {},
    });
    const openedFiles = new Set();
    async function openFile(filePath) {
        if (openedFiles.has(filePath))
            return;
        openedFiles.add(filePath);
        try {
            const fs = await import("node:fs/promises");
            const text = await fs.readFile(filePath, "utf8");
            const languageId = LANGUAGE_MAP[path.extname(filePath)] ?? "plaintext";
            await connection.sendNotification("textDocument/didOpen", {
                textDocument: {
                    uri: pathToFileURL(filePath).href,
                    languageId,
                    version: 0,
                    text,
                },
            });
        }
        catch {
            /* file may not exist yet */
        }
    }
    const client = {
        serverId,
        root,
        capabilities,
        openFile,
        async goToDefinition(pos, filePath) {
            await openFile(filePath);
            const result = await connection
                .sendRequest("textDocument/definition", {
                textDocument: { uri: pathToFileURL(filePath).href },
                position: { line: pos.line, character: pos.character },
            })
                .catch(() => null);
            if (!result)
                return [];
            const arr = Array.isArray(result) ? result : [result];
            return arr.filter(Boolean).map((loc) => ({
                uri: uriToPath(loc.targetUri ?? loc.uri),
                range: (loc.targetRange ?? loc.range),
            }));
        },
        async findReferences(pos, filePath) {
            await openFile(filePath);
            const result = await connection
                .sendRequest("textDocument/references", {
                textDocument: { uri: pathToFileURL(filePath).href },
                position: { line: pos.line, character: pos.character },
                context: { includeDeclaration: true },
            })
                .catch(() => []);
            if (!result)
                return [];
            return result.filter(Boolean).map((loc) => ({
                uri: uriToPath(loc.targetUri ?? loc.uri),
                range: (loc.targetRange ?? loc.range),
            }));
        },
        async hover(pos, filePath) {
            await openFile(filePath);
            return connection
                .sendRequest("textDocument/hover", {
                textDocument: { uri: pathToFileURL(filePath).href },
                position: { line: pos.line, character: pos.character },
            })
                .catch(() => null);
        },
        async documentSymbols(filePath) {
            await openFile(filePath);
            const result = await connection
                .sendRequest("textDocument/documentSymbol", {
                textDocument: { uri: pathToFileURL(filePath).href },
            })
                .catch(() => []);
            if (!result)
                return [];
            return result.map((sym) => {
                if ("location" in sym && sym.location && "uri" in sym.location) {
                    return {
                        ...sym,
                        location: { ...sym.location, uri: uriToPath(sym.location.uri) },
                    };
                }
                return sym;
            });
        },
        async getDiagnostics() {
            const result = {};
            for (const [file, diags] of diagnostics.entries())
                result[file] = diags;
            return result;
        },
        async shutdown() {
            try {
                await connection.sendRequest("shutdown");
            }
            catch {
                /* ignore */
            }
            connection.sendNotification("exit");
            connection.dispose();
            proc.kill();
        },
    };
    return client;
}
//# sourceMappingURL=client.js.map