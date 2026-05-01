import { resolve } from "node:path";
import { getLspManager } from "../lsp/index.js";
export const lspFindReferencesTool = {
    name: "find_references",
    description: "Find all references to a symbol at a given position using LSP. " +
        "Supports TypeScript, JavaScript, Python, Rust, and Go files when the " +
        "corresponding language server is installed.",
    inputSchema: {
        type: "object",
        properties: {
            filePath: {
                type: "string",
                description: "Absolute path to the source file",
            },
            line: { type: "number", description: "1-indexed line number" },
            character: { type: "number", description: "1-indexed character column" },
        },
        required: ["filePath", "line", "character"],
    },
    async execute(raw) {
        const input = raw;
        const filePath = resolve(input.filePath);
        try {
            const lsp = getLspManager();
            const locations = await lsp.findReferences(filePath, input.line, input.character);
            if (!locations.length) {
                return {
                    content: `No references found at ${filePath}:${input.line}:${input.character}`,
                    data: { references: [] },
                    isError: false,
                };
            }
            const formatted = locations.map((loc) => `${loc.uri}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`);
            return {
                content: `Found ${locations.length} reference(s):\n${formatted.join("\n")}`,
                data: { references: locations },
                isError: false,
            };
        }
        catch (err) {
            return {
                content: `LSP find_references failed: ${err instanceof Error ? err.message : String(err)}`,
                isError: true,
            };
        }
    },
};
//# sourceMappingURL=lsp-references.js.map