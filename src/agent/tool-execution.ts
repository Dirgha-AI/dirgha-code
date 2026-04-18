// @ts-nocheck
/**
 * agent/tool-execution.ts — Tool execution orchestration
 * 
 * Handles permission checks, routing, and execution of tools
 */
import { executeToolAsync } from './tools.js';
import { spawnAgent } from './spawn-agent.js';
import { getExtensionManager } from '../extensions/manager.js';
import { getMemoryManager } from '../memory/manager.js';
import { needsConfirmation } from '../permission/judge.js';
import { getStoredDecision, storeDecision } from '../permission/store.js';
import { promptConfirmation } from '../permission/confirmation.js';
import type { ContentBlock, ReplContext } from '../types.js';
// Stub types for packages/core security (avoids TS6059 rootDir errors)
type TrustLevel = 'high' | 'medium' | 'low' | 'untrusted';
const isToolAllowed = (_tool: string, _trust: TrustLevel): boolean => true;

// Per-file async mutex — prevents concurrent write-modify-write corruption when
// the task queue processes multiple prompts that touch the same file.
const _fileLocks = new Map<string, Promise<void>>();
async function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = _fileLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const curr = new Promise<void>(r => { release = r; });
  _fileLocks.set(key, prev.then(() => curr).catch(() => curr));
  await prev.catch(() => {});
  try { return await fn(); }
  finally { release(); if (_fileLocks.get(key) === curr) _fileLocks.delete(key); }
}
const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'edit_file_all', 'apply_patch', 'delete_file']);
function lockKeyForTool(name: string, input: Record<string, any>): string | null {
  if (WRITE_TOOLS.has(name)) return String(input['path'] ?? input['file_path'] ?? '');
  return null;
}

// Session trust level — degrades to 'untrusted' on injection detection
// Auto-recovers after 3 consecutive clean tool calls to avoid permanent session death
let sessionTrustLevel: TrustLevel = 'high';
let cleanToolCallsSinceInjection = 0;

export function getSessionTrustLevel(): TrustLevel { return sessionTrustLevel; }
export function resetSessionTrustLevel(): void { sessionTrustLevel = 'high'; cleanToolCallsSinceInjection = 0; }

// Inline injection scanner — avoids cross-package import complexity in CLI
// Tuned to avoid false positives on docs, READMEs, and security examples.
// Only match patterns that look like active injection attempts, not references.
const INJECTION_RE = [
  /ignore\s+(all\s+)?previous\s+instructions?\s*[.!]/i,  // require sentence ending to avoid doc references
  /forget\s+(your\s+)?instructions?\s+and\s/i,            // only match "forget instructions AND [do something]"
  /<<SYS>>/,                                               // Llama-specific, rare in real content
  /disregard\s+(all\s+)?previous\s+(instructions?|context)/i,
  /\u202e|\u202d/,                                         // bidi override chars (keep, these are real attacks)
  // Added 2026-04-18 after dual-model audit flagged tool-output smuggling:
  /<\/?\s*system\s*>/i,                                    // <system>/<system> — OpenAI/Anthropic confusion
  /<\|im_start\|>|<\|im_end\|>/,                            // ChatML frame markers
  /<\|start_header_id\|>|<\|end_header_id\|>/,              // Llama 3 frame markers
  /\[\/?INST\]/i,                                           // Mistral frame markers
  /\[\/?SYSTEM_PROMPT\]/i,                                  // custom framings
];

// Surgical sanitizer — runs unconditionally on every tool output, not just
// when INJECTION_RE matches. Strips frame markers so the model can't be
// tricked by a fetched page containing e.g. "<|im_start|>system\ndo X\n<|im_end|>"
function sanitizeToolFrameMarkers(s: string): string {
  return s
    .replace(/<\|im_start\|>\s*(system|assistant|user|developer)?/gi, '[frame-marker]')
    .replace(/<\|im_end\|>/g, '[frame-marker]')
    .replace(/<\|start_header_id\|>\s*(system|assistant|user|developer)?\s*<\|end_header_id\|>/gi, '[frame-marker]')
    .replace(/<\/?\s*system\s*>/gi, '[system-tag]')
    .replace(/\[\/?INST\]/gi, '[inst-tag]')
    .replace(/[\u202e\u202d\u200b\u200c\u200d\ufeff]/g, ''); // always strip bidi/zero-width
}

function isSuspiciousToolResult(content: string): boolean {
  return INJECTION_RE.some(re => re.test(content));
}

function guardToolResult(content: string, toolName: string): string {
  // Always sanitize frame markers — cheap, and avoids the "<system> smuggled
  // in web_fetch output" vector the audits called out as P1.
  const framed = sanitizeToolFrameMarkers(content);
  if (!isSuspiciousToolResult(framed)) return framed;
  const clean = framed
    .replace(/[\u202e\u202d\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return `[SECURITY: prompt injection detected in ${toolName} result — content sanitized]\n${clean}`;
}

const MEMORY_TOOLS = ['memory_store', 'memory_recall', 'memory_forget'];

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export async function executeToolWithPermissions(
  block: ContentBlock & { type: 'tool_use' },
  ctx: ReplContext | undefined,
  resolvedModel: string,
  onTool: (name: string, input: Record<string, any>) => void,
  onToolResult?: (toolUseId: string, name: string, result: import('../types.js').ToolResult) => void,
): Promise<ToolResultBlock> {
  const toolName = block.name ?? '';
  const toolInput = block.input ?? {};
  const toolId = block.id ?? '';
  const memMgr = getMemoryManager();
  const extMgr = getExtensionManager();

  onTool(toolName, toolInput);

  // Capability attenuation: block disallowed tools when session trust is degraded
  if (!isToolAllowed(toolName, sessionTrustLevel)) {
    return {
      type: 'tool_result',
      tool_use_id: toolId,
      content: `[BLOCKED: tool '${toolName}' is not permitted at trust level '${sessionTrustLevel}']`,
    };
  }

  const permLevel = ctx?.permissionLevel ?? 'WorkspaceWrite';
  if (needsConfirmation(toolName, permLevel, toolInput)) {
    let decision: string;
    try {
      const stored = getStoredDecision(toolName);
      decision = stored ?? await promptConfirmation(toolName, toolInput);
      if (!stored && (decision === 'always_allow' || decision === 'always_deny')) {
        storeDecision(toolName, decision);
      }
    } catch (e) {
      return { 
        type: 'tool_result', 
        tool_use_id: toolId, 
        content: `[Permission denied: confirmation failed - ${e instanceof Error ? e.message : String(e)}]` 
      };
    }
    if (decision === 'deny_once' || decision === 'always_deny') {
      return { type: 'tool_result', tool_use_id: toolId, content: '[Permission denied by user]' };
    }
  }

  const lockKey = lockKeyForTool(toolName, toolInput as Record<string, any>);
  const execFn = async () => MEMORY_TOOLS.includes(toolName)
    ? { tool: toolName, result: await memMgr.handleToolCall(toolName, toolInput) }
    : toolName === 'spawn_agent'
    ? await spawnAgent(toolInput as any, resolvedModel)
    : (extMgr.hasExtensions() && toolName.includes('__'))
      ? { tool: toolName, result: await extMgr.callTool(toolName, toolInput) }
      : await executeToolAsync(toolName, toolInput, ctx);
  const result = lockKey ? await withFileLock(lockKey, execFn) : await execFn();

  // Notify TUI of full tool result (includes structured diff for edit/write tools)
  try { onToolResult?.(toolId, toolName, result); } catch { /* TUI hook isolation */ }

  const rawContent = result.error ? `Error: ${result.error}` : result.result;
  const guarded = result.error ? rawContent : guardToolResult(String(rawContent ?? ''), toolName);
  // If injection was detected, degrade session trust for subsequent tool calls
  if (typeof guarded === 'string' && guarded.startsWith('[SECURITY:')) {
    sessionTrustLevel = 'untrusted';
    cleanToolCallsSinceInjection = 0;
  } else if (sessionTrustLevel === 'untrusted') {
    // Auto-recover after 3 consecutive clean tool results
    cleanToolCallsSinceInjection++;
    if (cleanToolCallsSinceInjection >= 3) {
      sessionTrustLevel = 'high';
      cleanToolCallsSinceInjection = 0;
    }
  }
  return { type: 'tool_result', tool_use_id: toolId, content: guarded };
}

export async function executeAllTools(
  toolBlocks: Array<ContentBlock & { type: 'tool_use' }>,
  ctx: ReplContext | undefined,
  resolvedModel: string,
  onTool: (name: string, input: Record<string, any>) => void,
  onToolResult?: (toolUseId: string, name: string, result: import('../types.js').ToolResult) => void,
): Promise<ToolResultBlock[]> {
  const promises = toolBlocks.map(block =>
    executeToolWithPermissions(block, ctx, resolvedModel, onTool, onToolResult)
  );
  return Promise.all(promises);
}
