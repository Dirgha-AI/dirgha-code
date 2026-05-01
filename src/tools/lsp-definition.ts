import { resolve } from "node:path";
import type { Tool } from "../tools/registry.js";
import type { ToolResult } from "../kernel/types.js";
import { getLspManager } from "../lsp/index.js";

export const lspGoToDefinitionTool: Tool = {
  name: "go_to_definition",
  description:
    "Navigate to the definition of a symbol at a given position using LSP. " +
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
    try {
      const lsp = getLspManager();
      const locations = await lsp.goToDefinition(
        filePath,
        input.line,
        input.character,
      );

      if (!locations.length) {
        return {
          content: `No definition found at ${filePath}:${input.line}:${input.character}`,
          data: { definitions: [] },
          isError: false,
        };
      }

      const formatted = locations.map(
        (loc) =>
          `${loc.uri}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`,
      );

      return {
        content: `Found ${locations.length} definition(s):\n${formatted.join("\n")}`,
        data: { definitions: locations },
        isError: false,
      };
    } catch (err: unknown) {
      return {
        content: `LSP go_to_definition failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
