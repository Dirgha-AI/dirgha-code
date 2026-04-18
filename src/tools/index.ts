/**
 * tools/index.ts — Tool definitions + dispatcher
 * Each tool implementation lives in its own slice file (≤100 lines).
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { orchestrateTask } from '../agent/spawn-agent.js';
import type { ToolResult, ReplContext } from '../types.js';

// ─── Implementations (imported from slices) ────────────────────────────────────
import { readFileTool, writeFileTool, editFileTool, editFileAllTool, applyPatchTool, makeDirTool, deleteFileTool } from './file.js';
import { runCommandTool } from './shell.js';
import { gitStatusTool, gitDiffTool, gitLogTool, gitCommitTool, checkpointTool, gitBranchTool, gitPushTool, gitStashTool, gitPatchTool, gitAutoMessageTool } from './git.js';
import { searchFilesTool, listFilesTool, globTool, webFetchTool, webSearchTool, qmdSearchTool, searchKnowledgeTool, indexFilesTool } from './search.js';
import { repoMapTool } from './repo.js';
import { saveMemoryTool, readMemoryTool, writeTodosTool, askUserTool } from './memory.js';
import { executeSandbox } from './sandbox.js';
import { browserTool } from './browser.js';
import { sessionSearchTool } from './session-search.js';
import { memoryGraphAddTool, memoryGraphQueryTool, memoryGraphLinkTool, memoryGraphPruneTool } from './memory-graph.js';
import { deployTriggerTool, deployStatusTool } from './deploy.js';
import { mcpManager } from '../mcp/manager.js';

export { TOOL_DEFINITIONS } from './defs.js';

// ─── Large response offload helper ────────────────────────────────────────────

function offloadIfLarge(content: string | undefined | null): string {
  if (!content) return content ?? '';
  if (content.length > 150000) {
    try {
      const tmpPath = path.join(os.tmpdir(), 'dirgha_resp_' + Date.now() + '.txt');
      fs.writeFileSync(tmpPath, content, 'utf8');
      return `[Response too large (${content.length.toLocaleString()} chars). Saved to: ${tmpPath}. Use read_file to examine it.]`;
    } catch { return content.slice(0, 150000) + '\n...[truncated]'; }
  }
  return content;
}

// ─── Sync dispatcher — file ops only (no process spawning) ───────────────────

export function executeTool(name: string, input: Record<string, any>, ctx?: ReplContext): ToolResult {
  let result: ToolResult;
  switch (name) {
    case 'write_file':    result = writeFileTool(input); break;
    case 'edit_file':     result = editFileTool(input); break;
    case 'edit_file_all': result = editFileAllTool(input); break;
    // apply_patch spawns `patch`; moved to executeToolAsync so it can't wedge
    // the event loop on slow patches. Emit a hint so callers migrate.
    case 'apply_patch':   return { tool: 'apply_patch', result: '', error: 'apply_patch is async — call executeToolAsync' };
    case 'make_dir':      result = makeDirTool(input); break;
    case 'delete_file':   result = deleteFileTool(input); break;
    case 'list_files':    result = listFilesTool(input); break;
    case 'glob':          result = globTool(input); break;
    case 'repo_map':      result = repoMapTool(input); break;
    case 'search_knowledge':  result = searchKnowledgeTool(input); break;
    case 'index_files':       result = indexFilesTool(input); break;
    case 'write_todos':       result = writeTodosTool(input, ctx); break;
    case 'read_memory':   result = readMemoryTool(); break;
    case 'session_search': result = sessionSearchTool(input); break;
    default:              return { tool: name, result: '', error: `Unknown tool: ${name}` };
  }
  return { ...result, result: offloadIfLarge(result.result) };
}

// ─── Async dispatcher — all process-spawning tools go here ───────────────────

export async function executeToolAsync(name: string, input: Record<string, any>, ctx?: ReplContext): Promise<ToolResult> {
  let result: ToolResult;
  // Shell + git: async so the event loop stays live (no REPL freeze)
  if (name === 'run_command' || name === 'bash')
                                result = await runCommandTool(input);
  else if (name === 'git_status')      result = await gitStatusTool();
  else if (name === 'git_diff')        result = await gitDiffTool(input);
  else if (name === 'git_log')         result = await gitLogTool(input);
  else if (name === 'git_commit')      result = await gitCommitTool(input);
  else if (name === 'checkpoint')      result = await checkpointTool(input);
  else if (name === 'git_branch')      result = await gitBranchTool(input);
  else if (name === 'git_push')        result = await gitPushTool(input);
  else if (name === 'git_stash')       result = await gitStashTool(input);
  else if (name === 'git_patch')       result = await gitPatchTool(input);
  else if (name === 'git_auto_message') result = await gitAutoMessageTool();
  else if (name === 'search_files')     result = await searchFilesTool(input);
  else if (name === 'execute_code')     result = await executeSandbox(input);
  else if (name === 'apply_patch')      result = await applyPatchTool(input);
  // Other async tools
  else if (name === 'read_file') result = await readFileTool(input);
  else if (name === 'save_memory') result = await saveMemoryTool(input);
  else if (name === 'ask_user')    result = await askUserTool(input);
  else if (name === 'web_search')  result = await webSearchTool(input);
  else if (name === 'web_fetch')   result = await webFetchTool(input);
  else if (name === 'qmd_search')  result = await qmdSearchTool(input);
  else if (name === 'browser')    result = browserTool(input);
  else if (name === 'spawn_agent') {
    const { spawnAgent } = await import('../agent/spawn-agent.js');
    result = await spawnAgent(input as any, ctx?.model ?? 'auto');
  }
  else if (name === 'orchestrate') {
    const orch = await orchestrateTask(input.task ?? '', ctx?.model ?? 'auto');
    result = { tool: 'orchestrate', result: `## Plan\n${orch.plan}\n\n## Implementation\n${orch.implementation}\n\n## Verification\n${orch.verification}` };
  }
  else if (name === 'memory_graph_add')   result = await memoryGraphAddTool(input as any);
  else if (name === 'memory_graph_query') result = await memoryGraphQueryTool(input as any);
  else if (name === 'memory_graph_link')  result = await memoryGraphLinkTool(input as any);
  else if (name === 'memory_graph_prune') result = await memoryGraphPruneTool(input as any);
  else if (name === 'deploy_trigger')     result = await deployTriggerTool(input as any);
  else if (name === 'deploy_status')      result = await deployStatusTool(input as any);
  else {
    try {
      // Fallback to MCP tools
      const mcpResult = await mcpManager.callTool(name, input);
      result = { tool: name, result: typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult) };
    } catch {
      result = executeTool(name, input, ctx);
    }
  }

  return { ...result, result: offloadIfLarge(result.result) };
}
