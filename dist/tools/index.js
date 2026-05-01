/**
 * Tools barrel. Exports the registry, the executor factory, and the
 * bundled built-in tools. Consumers typically import
 * `builtInTools` and register additional tools on top.
 */
import { fsReadTool } from "./fs-read.js";
import { fsWriteTool } from "./fs-write.js";
import { fsEditTool } from "./fs-edit.js";
import { fsLsTool } from "./fs-ls.js";
import { shellTool } from "./shell.js";
import { searchGrepTool } from "./search-grep.js";
import { searchGlobTool } from "./search-glob.js";
import { gitTool } from "./git.js";
import { browserTool } from "./browser.js";
import { checkpointTool } from "./checkpoint.js";
import { createCronTool } from "./cron.js";
import { lspGoToDefinitionTool } from "./lsp-definition.js";
import { lspFindReferencesTool } from "./lsp-references.js";
import { lspHoverTool } from "./lsp-hover.js";
import { lspDocumentSymbolsTool } from "./lsp-symbols.js";
// multimodal is a factory (needs runtime Provider) — wired in main.ts, not baked into builtInTools
// export { createMultimodalTool } from "./multimodal.js";
export { createCronTool } from "./cron.js";
export { createTaskTool } from "./task.js";
const cronTool = createCronTool();
export * from "./registry.js";
export * from "./permission.js";
export * from "./exec.js";
export * from "./diff.js";
export * from "./lsp-definition.js";
export * from "./lsp-references.js";
export * from "./lsp-hover.js";
export * from "./lsp-symbols.js";
export const builtInTools = [
    fsReadTool,
    fsWriteTool,
    fsEditTool,
    fsLsTool,
    shellTool,
    searchGrepTool,
    searchGlobTool,
    gitTool,
    browserTool,
    checkpointTool,
    cronTool,
    lspGoToDefinitionTool,
    lspFindReferencesTool,
    lspHoverTool,
    lspDocumentSymbolsTool,
];
export { fsReadTool, fsWriteTool, fsEditTool, fsLsTool, shellTool, searchGrepTool, searchGlobTool, gitTool, browserTool, checkpointTool, cronTool, lspGoToDefinitionTool, lspFindReferencesTool, lspHoverTool, lspDocumentSymbolsTool, };
//# sourceMappingURL=index.js.map