import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type WasmCommand = string;

export interface ToolResult {
  tool: string;
  result: string;
  success?: boolean;
  output?: string;
  error?: string;
}

export interface ExecuteOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  maxBuffer?: number;
}

const WASM_CACHE = new Map<string, Buffer>();
const NATIVE_COMMANDS = new Set(['ls', 'cat', 'echo', 'pwd', 'whoami', 'uname', 'sleep', 'sort', 'uniq', 'grep']);
export const WASM_COMMANDS = ['cat', 'grep', 'sed', 'find', 'jq', 'echo', 'sort', 'uniq'];

export async function wasm(
  command: WasmCommand,
  args: string[],
  options: ExecuteOptions & { input?: string } = {}
): Promise<ToolResult> {
  if (!command || typeof command !== 'string') {
    return {
      tool: command || 'unknown',
      result: '',
      success: false,
      error: 'Invalid command provided',
    };
  }

  try {
    if (NATIVE_COMMANDS.has(command)) {
      return executeNative(command, args, options);
    }
    return executeWasm(command, args, options);
  } catch (error) {
    const err = error as Error;
    return {
      tool: command,
      result: '',
      success: false,
      error: err.message,
    };
  }
}

export const wasmExecutor = { execute: wasm };

export async function pipeline(
  steps: Array<{ cmd: string; args: string[] }>,
  options: ExecuteOptions = {}
): Promise<ToolResult> {
  let currentInput = '';
  let lastResult: ToolResult = { tool: 'pipeline', result: '', success: true };

  for (const step of steps) {
    const res = await wasm(step.cmd, step.args, { ...options, input: currentInput });
    if (!res.success) return res;
    currentInput = res.output || '';
    lastResult = res;
  }

  return { ...lastResult, tool: 'pipeline' };
}

async function executeNative(
  command: WasmCommand,
  args: string[],
  options: ExecuteOptions & { input?: string }
): Promise<ToolResult> {
  try {
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      input: options.input,
      env: { ...process.env, ...options.env },
      timeout: options.timeout || 30000,
      maxBuffer: options.maxBuffer || 1024 * 1024,
      encoding: 'utf-8',
    });

    if (result.status !== 0) {
      return {
        tool: command,
        result: '',
        success: false,
        error: result.stderr || '',
      };
    }

    return {
      tool: command,
      result: result.stdout || '',
      success: true,
      output: result.stdout,
    };
  } catch (error) {
    const err = error as Error;
    return {
      tool: command,
      result: '',
      success: false,
      error: err.message,
    };
  }
}

async function executeWasm(
  command: WasmCommand,
  args: string[],
  options: ExecuteOptions
): Promise<ToolResult> {
  try {
    const wasmModule = await loadWasmModule(command);
    const result = await runWasmTool(wasmModule, command, args, options);
    
    if (result.exitCode !== 0) {
      return {
        tool: command,
        result: result.stdout || '',
        success: false,
        error: result.stderr || '',
        output: result.stdout,
      };
    }

    return {
      tool: command,
      result: result.stdout || '',
      success: true,
      output: result.stdout,
    };
  } catch (error) {
    const err = error as Error;
    return {
      tool: command,
      result: '',
      success: false,
      error: err.message,
    };
  }
}

interface WasmResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runWasmTool(
  module: Buffer,
  toolName: string,
  args: string[],
  options: ExecuteOptions
): Promise<WasmResult> {
  // Initialize WASM runtime with provided module buffer
  const runtime = await initializeRuntime(module);
  
  return new Promise((resolve, reject) => {
    try {
      const stdout = runtime.execute(toolName, args, {
        cwd: options.cwd,
        env: options.env,
      });
      
      resolve({
        exitCode: 0,
        stdout: stdout || '',
        stderr: '',
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function initializeRuntime(module: Buffer): Promise<any> {
  // Placeholder for WASM runtime initialization
  return {
    execute: (tool: string, args: string[], ctx: any) => {
      return '';
    }
  };
}

async function loadWasmModule(moduleName: string): Promise<Buffer> {
  if (WASM_CACHE.has(moduleName)) {
    return WASM_CACHE.get(moduleName)!;
  }

  const modulePath = path.join(__dirname, '..', 'wasm', `${moduleName}.wasm`);
  
  if (!fs.existsSync(modulePath)) {
    throw new Error(`WASM module not found: ${moduleName}`);
  }
  
  const buffer = fs.readFileSync(modulePath);
  WASM_CACHE.set(moduleName, buffer);
  return buffer;
}

export function clearWasmCache(): void {
  WASM_CACHE.clear();
}

export function getCachedModules(): string[] {
  return Array.from(WASM_CACHE.keys());
}
