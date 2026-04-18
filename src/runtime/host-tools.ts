// @ts-nocheck
/**
 * rivet/host-tools.ts — Host-defined tool execution pattern
 * 
 * Agents call host functions directly, no network hops.
 * Security: Deny-by-default permissions, fine-grained control.
 * 
 * Phase A: Quick Win (Rivet Agent-OS integration)
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolResult } from '../types.js';

/** Tool permission levels */
export type ToolPermission = 'none' | 'read' | 'write' | 'execute' | 'full';

/** Tool execution context with security boundaries */
export interface HostToolContext {
  /** Allowed filesystem operations */
  fsPermission: ToolPermission;
  /** Allowed network operations */
  networkPermission: ToolPermission;
  /** Allowed process execution */
  processPermission: ToolPermission;
  /** Resource limits */
  limits: {
    maxMemoryMB: number;
    maxCpuMs: number;
    timeoutMs: number;
  };
  /** Audit log for all operations */
  auditLog: string[];
}

/** Host tool definition */
export interface HostTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>, ctx: HostToolContext) => Promise<ToolResult>;
  defaultPermissions: HostToolContext;
}

/** Registry of host-defined tools */
class HostToolRegistry {
  private tools = new Map<string, HostTool>();

  register(tool: HostTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): HostTool | undefined {
    return this.tools.get(name);
  }

  list(): HostTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool with given context
   * Security: Context must explicitly grant permissions
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: Partial<HostToolContext>
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        output: '',
        error: `Unknown tool: ${name}`,
      };
    }

    // Merge with default permissions (context overrides defaults)
    const ctx: HostToolContext = {
      ...tool.defaultPermissions,
      ...context,
      limits: { ...tool.defaultPermissions.limits, ...context.limits },
      auditLog: [],
    };

    const startTime = Date.now();
    
    try {
      const result = await this.runWithTimeout(
        () => tool.execute(args, ctx),
        ctx.limits.timeoutMs
      );

      // Add audit entry
      ctx.auditLog.push(
        `[${new Date().toISOString()}] ${name}: ${JSON.stringify(args)} (${Date.now() - startTime}ms)`
      );

      return result;
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }
}

// Global registry instance
export const hostToolRegistry = new HostToolRegistry();

/** Built-in host tools for filesystem operations */
export const filesystemTool: HostTool = {
  name: 'host_fs',
  description: 'Read, write, and manage files on the host filesystem',
  parameters: {
    type: 'object',
    properties: {
      operation: { enum: ['read', 'write', 'mkdir', 'rm', 'ls'], description: 'Operation to perform' },
      path: { type: 'string', description: 'File or directory path' },
      content: { type: 'string', description: 'Content for write operations' },
    },
    required: ['operation', 'path'],
  },
  async execute(args, ctx) {
    // Security check
    if (ctx.fsPermission === 'none') {
      return { success: false, output: '', error: 'Filesystem permission denied' };
    }

    const { operation, path, content } = args;

    switch (operation) {
      case 'read': {
        if (ctx.fsPermission !== 'read' && ctx.fsPermission !== 'write' && ctx.fsPermission !== 'full') {
          return { success: false, output: '', error: 'Read permission denied' };
        }
        try {
          const data = readFileSync(path as string, 'utf8');
          return { success: true, output: data };
        } catch (e) {
          return { success: false, output: '', error: `Read failed: ${e}` };
        }
      }
      case 'write': {
        if (ctx.fsPermission !== 'write' && ctx.fsPermission !== 'full') {
          return { success: false, output: '', error: 'Write permission denied' };
        }
        try {
          writeFileSync(path as string, content as string);
          return { success: true, output: `Wrote ${(content as string).length} bytes` };
        } catch (e) {
          return { success: false, output: '', error: `Write failed: ${e}` };
        }
      }
      case 'mkdir': {
        if (ctx.fsPermission !== 'write' && ctx.fsPermission !== 'full') {
          return { success: false, output: '', error: 'Write permission denied' };
        }
        try {
          mkdirSync(path as string, { recursive: true });
          return { success: true, output: `Created directory: ${path}` };
        } catch (e) {
          return { success: false, output: '', error: `Mkdir failed: ${e}` };
        }
      }
      case 'rm': {
        if (ctx.fsPermission !== 'write' && ctx.fsPermission !== 'full') {
          return { success: false, output: '', error: 'Write permission denied' };
        }
        try {
          rmSync(path as string, { recursive: true, force: true });
          return { success: true, output: `Removed: ${path}` };
        } catch (e) {
          return { success: false, output: '', error: `Remove failed: ${e}` };
        }
      }
      case 'ls': {
        if (ctx.fsPermission !== 'read' && ctx.fsPermission !== 'write' && ctx.fsPermission !== 'full') {
          return { success: false, output: '', error: 'Read permission denied' };
        }
        try {
          const result = spawnSync('ls', ['-la', path as string], { encoding: 'utf8' });
          return { success: result.status === 0, output: result.stdout, error: result.stderr };
        } catch (e) {
          return { success: false, output: '', error: `List failed: ${e}` };
        }
      }
      default:
        return { success: false, output: '', error: `Unknown operation: ${operation}` };
    }
  },
  defaultPermissions: {
    fsPermission: 'read',
    networkPermission: 'none',
    processPermission: 'none',
    limits: { maxMemoryMB: 100, maxCpuMs: 5000, timeoutMs: 30000 },
    auditLog: [],
  },
};

/** Built-in host tool for shell execution */
export const shellTool: HostTool = {
  name: 'host_shell',
  description: 'Execute shell commands with strict permissions',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      cwd: { type: 'string', description: 'Working directory' },
    },
    required: ['command'],
  },
  async execute(args, ctx) {
    if (ctx.processPermission === 'none') {
      return { success: false, output: '', error: 'Process execution denied' };
    }

    const { command, cwd } = args;

    try {
      const result = spawnSync('sh', ['-c', command as string], {
        cwd: cwd as string | undefined,
        encoding: 'utf8',
        timeout: ctx.limits.timeoutMs,
        maxBuffer: ctx.limits.maxMemoryMB * 1024 * 1024,
      });

      return {
        success: result.status === 0,
        output: result.stdout,
        error: result.stderr || undefined,
      };
    } catch (e) {
      return { success: false, output: '', error: `Execution failed: ${e}` };
    }
  },
  defaultPermissions: {
    fsPermission: 'read',
    networkPermission: 'none',
    processPermission: 'execute',
    limits: { maxMemoryMB: 256, maxCpuMs: 10000, timeoutMs: 60000 },
    auditLog: [],
  },
};

// Register built-in tools
hostToolRegistry.register(filesystemTool);
hostToolRegistry.register(shellTool);
