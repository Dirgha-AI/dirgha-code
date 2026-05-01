import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, unlinkSync } from "node:fs";
import { createLspConnection, symbolKindLabel } from "../client.js";
import {
  getServerForFile,
  detectInstalledServers,
  KNOWN_SERVERS,
} from "../detector.js";
import { getLspManager, LspManager } from "../index.js";
import { spawn } from "node:child_process";

describe("LSP symbolKindLabel", () => {
  it("returns correct labels", () => {
    expect(symbolKindLabel(5)).toBe("Class");
    expect(symbolKindLabel(12)).toBe("Function");
    expect(symbolKindLabel(6)).toBe("Method");
    expect(symbolKindLabel(999)).toBe("Kind(999)");
  });
});

describe("LSP JSON-RPC connection", () => {
  it("sendRequest resolves correctly with mock server", async () => {
    const server = spawn(
      "node",
      [
        "-e",
        `
      process.stdin.setEncoding('utf8');
      var buf = '';
      process.stdin.on('data', function(d) {
        buf += d;
        var idx = buf.indexOf('\\r\\n\\r\\n');
        if (idx === -1) return;
        var header = buf.slice(0, idx);
        var m = header.match(/Content-Length: (\\d+)/i);
        if (!m) return;
        var len = parseInt(m[1]);
        var bodyStart = idx + 4;
        if (buf.length < bodyStart + len) return;
        var body = buf.slice(bodyStart, bodyStart + len);
        buf = buf.slice(bodyStart + len);
        try {
          var msg = JSON.parse(body);
          if (msg.method === 'initialize') {
            var resp = JSON.stringify({jsonrpc:'2.0',id:msg.id,result:{capabilities:{definitionProvider:true}}});
            process.stdout.write('Content-Length: ' + Buffer.byteLength(resp) + '\\r\\n\\r\\n' + resp);
          } else if (msg.method === 'shutdown') {
            var resp = JSON.stringify({jsonrpc:'2.0',id:msg.id,result:null});
            process.stdout.write('Content-Length: ' + Buffer.byteLength(resp) + '\\r\\n\\r\\n' + resp);
            process.exit(0);
          }
        } catch(e) {}
      });
    `,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const conn = createLspConnection(server);

    const result = await conn.sendRequest<{
      capabilities: Record<string, unknown>;
    }>("initialize", {
      processId: process.pid,
      rootUri: "file:///test",
      capabilities: {},
    });

    expect(result).toBeDefined();
    expect(result.capabilities).toBeDefined();
    expect(result.capabilities.definitionProvider).toBe(true);
    conn.dispose();
    server.kill("SIGKILL");
  }, 15000);

  it("sendRequest returns error on failure", async () => {
    const server = spawn(
      "node",
      [
        "-e",
        `
      process.stdin.setEncoding('utf8');
      var buf = '';
      process.stdin.on('data', function(d) {
        buf += d;
        var idx = buf.indexOf('\\r\\n\\r\\n');
        if (idx === -1) return;
        var header = buf.slice(0, idx);
        var m = header.match(/Content-Length: (\\d+)/i);
        if (!m) return;
        var len = parseInt(m[1]);
        var bodyStart = idx + 4;
        if (buf.length < bodyStart + len) return;
        var body = buf.slice(bodyStart, bodyStart + len);
        buf = buf.slice(bodyStart + len);
        try {
          var msg = JSON.parse(body);
          var resp = JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32000,message:'not found'}});
          process.stdout.write('Content-Length: ' + Buffer.byteLength(resp) + '\\r\\n\\r\\n' + resp);
        } catch(e) {}
      });
    `,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const conn = createLspConnection(server);

    await expect(
      conn.sendRequest("textDocument/definition", {
        textDocument: { uri: "file:///x.ts" },
        position: { line: 0, character: 0 },
      }),
    ).rejects.toThrow("not found");

    conn.dispose();
    server.kill("SIGKILL");
  }, 10000);
});

describe("LSP Detector", () => {
  it("KNOWN_SERVERS has expected servers", () => {
    expect(KNOWN_SERVERS.length).toBeGreaterThanOrEqual(4);
    const ids = KNOWN_SERVERS.map((s) => s.id);
    expect(ids).toContain("typescript");
    expect(ids).toContain("pyright");
    expect(ids).toContain("rust-analyzer");
    expect(ids).toContain("gopls");
  });

  it("getServerForFile maps extensions correctly", () => {
    const ts = getServerForFile("/project/src/index.ts");
    expect(ts).toBeDefined();
    expect(ts?.id).toBe("typescript");

    const py = getServerForFile("/project/main.py");
    expect(py).toBeDefined();
    expect(py?.id).toBe("pyright");

    const rs = getServerForFile("/project/src/lib.rs");
    expect(rs).toBeDefined();
    expect(rs?.id).toBe("rust-analyzer");

    const go = getServerForFile("/project/main.go");
    expect(go).toBeDefined();
    expect(go?.id).toBe("gopls");

    const unknown = getServerForFile("/project/README.md");
    expect(unknown).toBeUndefined();
  });

  it("detectInstalledServers returns array", () => {
    const installed = detectInstalledServers();
    expect(Array.isArray(installed)).toBe(true);
  });
});

describe("LSP Manager", () => {
  it("getLspManager returns singleton", () => {
    const lsp1 = getLspManager();
    const lsp2 = getLspManager();
    expect(lsp1).toBe(lsp2);
  });

  it("hasClients returns false for unknown file type", async () => {
    const lsp = getLspManager();
    const has = await lsp.hasClients("/tmp/file.md");
    expect(has).toBe(false);
  });

  it("status returns empty when no clients connected", () => {
    const lsp = getLspManager();
    expect(lsp.status()).toEqual([]);
  });
});

describe("LSP Tools (unit)", () => {
  it("tools are importable and pass registry validation", async () => {
    const { lspGoToDefinitionTool } =
      await import("../../tools/lsp-definition.js");
    const { lspFindReferencesTool } =
      await import("../../tools/lsp-references.js");
    const { lspHoverTool } = await import("../../tools/lsp-hover.js");
    const { lspDocumentSymbolsTool } =
      await import("../../tools/lsp-symbols.js");

    expect(lspGoToDefinitionTool.name).toBe("go_to_definition");
    expect(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(lspGoToDefinitionTool.name)).toBe(
      true,
    );

    expect(lspFindReferencesTool.name).toBe("find_references");
    expect(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(lspFindReferencesTool.name)).toBe(
      true,
    );

    expect(lspHoverTool.name).toBe("hover_documentation");
    expect(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(lspHoverTool.name)).toBe(true);

    expect(lspDocumentSymbolsTool.name).toBe("document_symbols");
    expect(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(lspDocumentSymbolsTool.name)).toBe(
      true,
    );

    expect(typeof lspGoToDefinitionTool.execute).toBe("function");
    expect(typeof lspFindReferencesTool.execute).toBe("function");
    expect(typeof lspHoverTool.execute).toBe("function");
    expect(typeof lspDocumentSymbolsTool.execute).toBe("function");
  });

  it("go_to_definition returns empty for unknown file type", async () => {
    const { lspGoToDefinitionTool } =
      await import("../../tools/lsp-definition.js");
    const tmpFile = join(tmpdir(), `lsp-test-${Date.now()}.md`);
    writeFileSync(tmpFile, "# Test\n");
    try {
      const result = await lspGoToDefinitionTool.execute(
        { filePath: tmpFile, line: 1, character: 1 },
        {
          cwd: "/",
          env: {},
          sessionId: "test",
          signal: new AbortController().signal,
        },
      );
      expect(result.content).toBeTruthy();
      expect(result.data?.definitions).toEqual([]);
      expect(result.isError).toBe(false);
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {}
    }
  });

  it("find_references returns empty for unknown file type", async () => {
    const { lspFindReferencesTool } =
      await import("../../tools/lsp-references.js");
    const tmpFile = join(tmpdir(), `lsp-test-${Date.now()}.md`);
    writeFileSync(tmpFile, "# Test\n");
    try {
      const result = await lspFindReferencesTool.execute(
        { filePath: tmpFile, line: 1, character: 1 },
        {
          cwd: "/",
          env: {},
          sessionId: "test",
          signal: new AbortController().signal,
        },
      );
      expect(result.data?.references).toEqual([]);
      expect(result.isError).toBe(false);
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {}
    }
  });

  it("hover_documentation returns null for unknown file type", async () => {
    const { lspHoverTool } = await import("../../tools/lsp-hover.js");
    const tmpFile = join(tmpdir(), `lsp-test-${Date.now()}.md`);
    writeFileSync(tmpFile, "# Test\n");
    try {
      const result = await lspHoverTool.execute(
        { filePath: tmpFile, line: 1, character: 1 },
        {
          cwd: "/",
          env: {},
          sessionId: "test",
          signal: new AbortController().signal,
        },
      );
      expect(result.data?.hover).toBeNull();
      expect(result.isError).toBe(false);
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {}
    }
  });

  it("document_symbols returns empty for unknown file type", async () => {
    const { lspDocumentSymbolsTool } =
      await import("../../tools/lsp-symbols.js");
    const tmpFile = join(tmpdir(), `lsp-test-${Date.now()}.md`);
    writeFileSync(tmpFile, "# Test\n");
    try {
      const result = await lspDocumentSymbolsTool.execute(
        { filePath: tmpFile },
        {
          cwd: "/",
          env: {},
          sessionId: "test",
          signal: new AbortController().signal,
        },
      );
      expect(result.content).toContain("No symbols");
      expect(result.isError).toBe(false);
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {}
    }
  });
});

describe("Tool registry integration", () => {
  it("builtInTools includes all LSP tools", async () => {
    const { builtInTools } = await import("../../tools/index.js");
    const names = builtInTools.map((t) => t.name);
    expect(names).toContain("go_to_definition");
    expect(names).toContain("find_references");
    expect(names).toContain("hover_documentation");
    expect(names).toContain("document_symbols");
  });

  it("all LSP tool names pass registry validation", async () => {
    const { builtInTools } = await import("../../tools/index.js");
    const lspTools = builtInTools.filter((t) =>
      [
        "go_to_definition",
        "find_references",
        "hover_documentation",
        "document_symbols",
      ].includes(t.name),
    );
    for (const tool of lspTools) {
      expect(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tool.name)).toBe(true);
    }
  });
});
