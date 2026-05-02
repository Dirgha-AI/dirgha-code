import { resolve } from "node:path";
import type { Tool } from "../tools/registry.js";
import type { ToolResult } from "../kernel/types.js";
import { getLspManager } from "../lsp/index.js";

export const lspFindReferencesTool: Tool = {
  name: "find_references",
  description:
    "Find all references to a symbol at a given position using LSP. " +
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
  async execute(raw: unknown): Promise<ToolResult> {
    const input = raw as { filePath: string; line: number; character: number };
    const filePath = resolve(input.filePath);
    const lsp = getLspManager();

    // Check if any language server is serving this file before calling.
    const clients = await lsp.getClients(filePath);
    if (clients.length === 0) {
      return {
        content: `No language server available for ${filePath}. Install the appropriate LSP server (e.g. typescript-language-server, pyright, rust-analyzer). Use search_grep as a fallback for symbol lookup.`,
        data: { references: [] },
        isError: false,
      };
    }

    try {
      const locations = await lsp.findReferences(
        filePath,
        input.line,
        input.character,
      );

      if (!locations.length) {
        return {
          content: `No references found at ${filePath}:${input.line}:${input.character}`,
          data: { references: [] },
          isError: false,
        };
      }

      const formatted = locations.map(
        (loc) =>
          `${loc.uri}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`,
      );

      return {
        content: `Found ${locations.length} reference(s):\n${formatted.join("\n")}`,
        data: { references: locations },
        isError: false,
      };
    } catch (err: unknown) {
      return {
        content: `LSP find_references failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
