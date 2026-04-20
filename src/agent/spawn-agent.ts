/**
 * spawn-agent.ts — Sub-agent spawning for Dirgha CLI v2.
 * Implements the spawn_agent tool: creates isolated sub-agents with
 * restricted tool allowlists (Explore | Plan | Verify | Code | Research pattern).
 *
 * The tool result is the sub-agent's final text output.
 */
import { callGateway } from './gateway.js';
import { executeToolAsync } from './tools.js';
import type { Message, ToolResult } from '../types.js';

export type AgentType = 'explore' | 'plan' | 'verify' | 'code' | 'research' | 'custom';

/** Tools available per agent type */
const ALLOWLISTS: Record<AgentType, string[]> = {
  explore:  ['read_file', 'glob', 'list_files', 'search_files'],
  plan:     ['read_file', 'glob', 'list_files', 'search_files', 'web_search'],
  verify:   ['read_file', 'search_files', 'bash'],
  code:     ['read_file', 'write_file', 'edit_file', 'edit_file_all', 'search_files', 'glob', 'list_files', 'bash', 'git_status', 'git_diff'],
  research: ['read_file', 'search_files', 'web_fetch', 'web_search', 'browser', 'glob'],
  custom:   [], // caller provides tools list
};

/** Per-type system prompts */
const SYSTEM_PROMPTS: Record<AgentType, string> = {
  explore:  'You are a codebase explorer. Search files, read code, and report findings. Do NOT modify any files.',
  plan:     'You are a technical planner. Analyze the codebase and web resources, then produce a step-by-step implementation plan with file paths and specific changes needed.',
  verify:   'You are a code verifier. Read the relevant code and run tests/checks to verify correctness. Report pass/fail with evidence.',
  code:     'You are a coding agent. Implement the requested changes by reading, writing, and editing files. Run tests after changes. Be precise and minimal.',
  research: 'You are a research agent. Search the web, browse pages, and read files to gather information. Summarize findings concisely.',
  custom:   'You are a focused sub-agent. Complete the task using only your allowed tools.',
};

const DEFAULT_MAX_ITERATIONS = 10;
const CODE_MAX_ITERATIONS = 15;

export interface SpawnAgentInput {
  type: AgentType;
  task: string;
  tools?: string[];   // used when type === 'custom'
  model?: string;
}

export async function spawnAgent(
  input: SpawnAgentInput,
  parentModel: string,
  onProgress?: (msg: string) => void,
): Promise<ToolResult> {
  const { type = 'explore', task, tools, model } = input;
  if (!task) return { tool: 'spawn_agent', result: '', error: 'task is required' };

  const allowlist = type === 'custom' ? (tools ?? []) : ALLOWLISTS[type];
  const resolvedModel = model ?? parentModel;
  const maxIter = type === 'code' ? CODE_MAX_ITERATIONS : DEFAULT_MAX_ITERATIONS;

  const systemPrompt = `${SYSTEM_PROMPTS[type]}
Allowed tools: ${allowlist.join(', ') || 'none'}.
Do NOT use tools outside the allowed list.`;

  const history: Message[] = [{ role: 'user', content: task }];
  const output: string[] = [];

  for (let i = 0; i < maxIter; i++) {
    let response: any;
    try {
      response = await callGateway(history, systemPrompt, resolvedModel, (t) => { output.push(t); });
    } catch (err) {
      return { tool: 'spawn_agent', result: output.join(''), error: String(err) };
    }

    const toolBlocks = response.content.filter((b: any) => b.type === 'tool_use');
    const textBlocks = response.content.filter((b: any) => b.type === 'text');
    for (const b of textBlocks) if (b.text) output.push(b.text);

    if (toolBlocks.length === 0) break;
    history.push({ role: 'assistant', content: response.content });

    for (const block of toolBlocks) {
      const name: string = block.name ?? '';
      if (!allowlist.includes(name)) {
        history.push({ role: 'tool', tool_call_id: block.id ?? '', content: `Tool '${name}' not permitted for ${type} agent.` });
        continue;
      }
      onProgress?.(`[${type}] Using tool: ${name}`);
      const result = await executeToolAsync(name, block.input ?? {});
      history.push({ role: 'tool', tool_call_id: block.id ?? '', content: result.error ? `Error: ${result.error}` : result.result });
    }
  }

  return { tool: 'spawn_agent', result: output.join('\n') };
}

/** Plan→Code→Verify pipeline (3-phase orchestration) */
export interface OrchestrateResult {
  plan: string;
  implementation: string;
  verification: string;
}

export async function orchestrateTask(
  task: string,
  model: string,
  onProgress?: (phase: string, msg: string) => void,
): Promise<OrchestrateResult> {
  const result: OrchestrateResult = { plan: '', implementation: '', verification: '' };

  onProgress?.('plan', 'Starting planning phase...');
  try {
    const planResult = await spawnAgent(
      { type: 'plan', task: 'Analyze and create a step-by-step plan for: ' + task },
      model, (msg) => onProgress?.('plan', msg),
    );
    result.plan = planResult.error ? `[Plan error] ${planResult.error}\n${planResult.result}` : planResult.result;
  } catch (err) { result.plan = `[Plan failed] ${err}`; }

  onProgress?.('code', 'Starting implementation phase...');
  try {
    const codeResult = await spawnAgent(
      { type: 'code', task: `Implement this plan:\n${result.plan}\n\nOriginal task: ${task}` },
      model, (msg) => onProgress?.('code', msg),
    );
    result.implementation = codeResult.error ? `[Code error] ${codeResult.error}\n${codeResult.result}` : codeResult.result;
  } catch (err) { result.implementation = `[Code failed] ${err}`; }

  onProgress?.('verify', 'Starting verification phase...');
  try {
    const verifyResult = await spawnAgent(
      { type: 'verify', task: `Verify the implementation of: ${task}\nPlan was: ${result.plan}` },
      model, (msg) => onProgress?.('verify', msg),
    );
    result.verification = verifyResult.error ? `[Verify error] ${verifyResult.error}\n${verifyResult.result}` : verifyResult.result;
  } catch (err) { result.verification = `[Verify failed] ${err}`; }

  return result;
}

/** Tool definition for TOOL_DEFINITIONS array */
export const SPAWN_AGENT_DEFINITION = {
  name: 'spawn_agent',
  description: 'Spawn a focused sub-agent for a specific task. Types: explore (read-only file search), plan (analysis + web), verify (read + bash), code (read/write/edit files + bash), research (web + browser + files). Returns sub-agent output as a string.',
  input_schema: {
    type: 'object' as const,
    properties: {
      type: { type: 'string', enum: ['explore', 'plan', 'verify', 'code', 'research', 'custom'], description: 'Sub-agent type determining allowed tools' },
      task: { type: 'string', description: 'The task or question for the sub-agent to complete' },
      tools: { type: 'array', items: { type: 'string' }, description: 'Custom tool list when type=custom' },
      model: { type: 'string', description: 'Override model for sub-agent (defaults to parent model)' },
    },
    required: ['type', 'task'],
  },
};
