import { resolve } from "node:path";
import { getLspManager, symbolKindLabel, } from "../lsp/index.js";
function isDocumentSymbol(sym) {
    return "selectionRange" in sym && !("location" in sym);
}
function formatSymbol(sym, indent = 0) {
    const prefix = "  ".repeat(indent);
    const kind = symbolKindLabel(sym.kind);
    const line = isDocumentSymbol(sym)
        ? `${prefix}${kind} ${sym.name} [L${sym.range.start.line + 1}:C${sym.range.start.character + 1}]`
        : `${prefix}${kind} ${sym.name}`;
    if (isDocumentSymbol(sym) && sym.children?.length) {
        return (line +
            "\n" +
            sym.children.map((c) => formatSymbol(c, indent + 1)).join("\n"));
    }
    return line;
}
export const lspDocumentSymbolsTool = {
    name: "document_symbols",
    description: "List all symbols in a document using LSP (classes, functions, variables, etc.). " +
        "Supports TypeScript, JavaScript, Python, Rust, and Go files when the " +
        "corresponding language server is installed.",
    inputSchema: {
        type: "object",
        properties: {
            filePath: {
                type: "string",
                description: "Absolute path to the source file",
            },
        },
        required: ["filePath"],
    },
    async execute(raw) {
        const input = raw;
        const filePath = resolve(input.filePath);
        try {
            const lsp = getLspManager();
            const symbols = await lsp.documentSymbols(filePath);
            if (!symbols.length) {
                return {
                    content: `No symbols found in ${filePath}`,
                    data: { symbols: [] },
                    isError: false,
                };
            }
            const formatted = symbols.map((s) => formatSymbol(s)).join("\n");
            return {
                content: `Symbols in ${filePath}:\n${formatted}`,
                data: { symbols },
                isError: false,
            };
        }
        catch (err) {
            return {
                content: `LSP document_symbols failed: ${err instanceof Error ? err.message : String(err)}`,
                isError: true,
            };
        }
    },
};
//# sourceMappingURL=lsp-symbols.js.map