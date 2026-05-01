import { resolve } from "node:path";
import type { Tool } from "../tools/registry.js";
import type { ToolResult } from "../kernel/types.js";
import { getLspManager } from "../lsp/index.js";

export const lspHoverTool: Tool = {
  name: "hover_documentation",
  description:
    "Get hover documentation for a symbol at a given position using LSP. " +
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
      const result = await lsp.hover(filePath, input.line, input.character);

      if (!result) {
        return {
          content: `No documentation available at ${filePath}:${input.line}:${input.character}`,
          data: { hover: null },
          isError: false,
        };
      }

      let text: string;
      const contents = result.contents;
      if (typeof contents === "string") {
        text = contents;
      } else if (Array.isArray(contents)) {
        text = contents
          .map((c) =>
            typeof c === "string"
              ? c
              : `\`\`\`${c.language ?? ""}\n${c.value}\n\`\`\``,
          )
          .join("\n");
      } else if (
        contents &&
        typeof contents === "object" &&
        "value" in contents
      ) {
        const marked = contents as { language?: string; value: string };
        text = `\`\`\`${marked.language ?? ""}\n${marked.value}\n\`\`\``;
      } else {
        text = JSON.stringify(contents);
      }

      return {
        content: text,
        data: { hover: result },
        isError: false,
      };
    } catch (err: unknown) {
      return {
        content: `LSP hover failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  },
};
