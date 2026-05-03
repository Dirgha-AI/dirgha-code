/**
 * Tools barrel. Exports the registry, the executor factory, and the
 * bundled built-in tools. Consumers typically import
 * `builtInTools` and register additional tools on top.
 */

import type { Tool } from "./registry.js";
import { fsReadTool } from "./fs-read.js";
import { fsWriteTool } from "./fs-write.js";
import { fsEditTool } from "./fs-edit.js";
import { fsLsTool } from "./fs-ls.js";
import { shellTool } from "./shell.js";
import { searchGrepTool } from "./search-grep.js";
import { searchGlobTool } from "./search-glob.js";
import { gitTool } from "./git.js";
import { browserTool } from "./browser.js";
import { createCheckpointTool } from "./checkpoint.js";
import { createCronTool } from "./cron.js";
import { lspGoToDefinitionTool } from "./lsp-definition.js";
import { lspFindReferencesTool } from "./lsp-references.js";
import { lspHoverTool } from "./lsp-hover.js";
import { lspDocumentSymbolsTool } from "./lsp-symbols.js";
import { rtkTool } from "./rtk.js";
import { qmdTool } from "./qmd.js";
import { githubTool } from "./github.js";
export { createMultimodalTool } from "./multimodal.js";

export { createCronTool } from "./cron.js";
export { createCheckpointTool } from "./checkpoint.js";
export { createTaskTool } from "./task.js";

const cronTool = createCronTool();
const checkpointTool = createCheckpointTool();

export * from "./registry.js";
export * from "./permission.js";
export * from "./exec.js";
export * from "./diff.js";

export * from "./lsp-definition.js";
export * from "./lsp-references.js";
export * from "./lsp-hover.js";
export * from "./lsp-symbols.js";

export const builtInTools: Tool[] = [
  fsReadTool,
  fsWriteTool,
  fsEditTool,
  fsLsTool,
  shellTool,
  searchGrepTool,
  searchGlobTool,
  gitTool,
  githubTool,
  browserTool,
  checkpointTool,
  cronTool,
  lspGoToDefinitionTool,
  lspFindReferencesTool,
  lspHoverTool,
  lspDocumentSymbolsTool,
  rtkTool,
  qmdTool,
];

export {
  fsReadTool,
  fsWriteTool,
  fsEditTool,
  fsLsTool,
  shellTool,
  searchGrepTool,
  searchGlobTool,
  gitTool,
  githubTool,
  browserTool,
  checkpointTool,
  cronTool,
  lspGoToDefinitionTool,
  lspFindReferencesTool,
  lspHoverTool,
  lspDocumentSymbolsTool,
  rtkTool,
  qmdTool,
};
