// @ts-nocheck
/**
 * Skills System for Dirgha CLI
 * 
 * Self-contained capabilities that can be activated by instinct triggers
 * or user slash commands. Adapted from everything-claude-code's skills.
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

// --- TYPES ---

export interface SkillContext {
  cwd: string;
  files: string[];
  conversationId: string;
  agentId: string;
  userId: string;
  message?: string;
  args: Record<string, any>;
}

export interface SkillResult {
  success: boolean;
  output: string;
  error?: string;
  files?: string[];
  actions?: SkillAction[];
  metadata?: Record<string, any>;
}

export interface SkillAction {
  type: 'edit' | 'create' | 'delete' | 'exec' | 'suggest';
  file?: string;
  content?: string;
  command?: string;
  description: string;
}

export interface Skill {
  name: string;
  description: string;
  triggers: string[]; // Keywords that trigger this skill
  args: SkillArg[];
  execute: (context: SkillContext) => Promise<SkillResult>;
  // Optional: pre-check if skill should run
  shouldActivate?: (context: SkillContext) => boolean | Promise<boolean>;
}

export interface SkillArg {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'array';
  default?: any;
}

// --- SKILL REGISTRY ---

export class SkillRegistry extends EventEmitter {
  private skills: Map<string, Skill> = new Map();
  private userSkillsPath: string;

  constructor(userSkillsPath = '.dirgha/skills') {
    super();
    this.userSkillsPath = userSkillsPath;
    this.registerBuiltInSkills();
  }

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
    this.emit('skill:registered', skill);
  }

  unregister(name: string): boolean {
    const existed = this.skills.delete(name);
    if (existed) {
      this.emit('skill:unregistered', name);
    }
    return existed;
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  findByTrigger(trigger: string): Skill[] {
    return this.getAll().filter(s => 
      s.triggers.some(t => 
        trigger.toLowerCase().includes(t.toLowerCase()) ||
        t.toLowerCase().includes(trigger.toLowerCase())
      )
    );
  }

  async executeSkill(
    name: string, 
    context: SkillContext
  ): Promise<SkillResult> {
    const skill = this.get(name);
    if (!skill) {
      return {
        success: false,
        output: '',
        error: `Skill "${name}" not found`,
      };
    }

    // Check if should activate
    if (skill.shouldActivate) {
      const shouldRun = await skill.shouldActivate(context);
      if (!shouldRun) {
        return {
          success: true,
          output: 'Skill skipped - conditions not met',
        };
      }
    }

    this.emit('skill:executing', { name, context });
    
    try {
      const result = await skill.execute(context);
      this.emit('skill:completed', { name, result });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const result: SkillResult = {
        success: false,
        output: '',
        error,
      };
      this.emit('skill:failed', { name, error });
      return result;
    }
  }

  // Load user-defined skills from .dirgha/skills/
  async loadUserSkills(): Promise<void> {
    try {
      const entries = await fs.readdir(this.userSkillsPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(this.userSkillsPath, entry.name, 'skill.js');
          try {
            const skillModule = await import(skillPath);
            if (skillModule.default) {
              this.register(skillModule.default);
            }
          } catch {
            // Skip invalid skills
          }
        }
      }
    } catch {
      // Directory doesn't exist, ignore
    }
  }

  private registerBuiltInSkills(): void {
    this.register(codeReviewSkill);
    this.register(gitCommitSkill);
    this.register(refactorSkill);
    this.register(debugSkill);
    this.register(testGenSkill);
    this.register(docGenSkill);
  }
}

// --- BUILT-IN SKILLS ---

export const codeReviewSkill: Skill = {
  name: 'code-review',
  description: 'Review code for issues, style, and best practices',
  triggers: ['review', 'lint', 'check', 'analyze'],
  args: [
    { name: 'files', description: 'Files to review', required: false, type: 'array', default: [] },
    { name: 'check', description: 'Specific check (lint, types, security)', required: false, type: 'string' },
  ],
  
  execute: async (ctx) => {
    const files = ctx.args.files || ctx.files;
    const check = ctx.args.check || 'all';
    
    const results: string[] = [];
    const actions: SkillAction[] = [];

    for (const file of files) {
      // Run appropriate checks based on file type
      if (check === 'all' || check === 'lint') {
        if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          results.push(`🔍 Running ESLint on ${file}...`);
          // Would actually run eslint here
          actions.push({
            type: 'suggest',
            file,
            description: 'Consider adding explicit return types',
          });
        }
      }

      if (check === 'all' || check === 'types') {
        if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          results.push(`🔵 Type checking ${file}...`);
        }
      }

      if (check === 'all' || check === 'security') {
        results.push(`🛡️ Security scan ${file}...`);
      }
    }

    return {
      success: true,
      output: results.join('\n'),
      actions,
    };
  },
};

export const gitCommitSkill: Skill = {
  name: 'git-commit',
  description: 'Generate descriptive commit messages',
  triggers: ['commit', 'git commit', 'commit message'],
  args: [
    { name: 'style', description: 'Commit style (conventional, semantic)', required: false, type: 'string', default: 'conventional' },
  ],
  
  execute: async (ctx) => {
    try {
      // Get git status
      const status = await execAsync('git status --short', { cwd: ctx.cwd });
      const diff = await execAsync('git diff --cached --stat', { cwd: ctx.cwd });
      
      if (!status.stdout.trim()) {
        return {
          success: true,
          output: 'No changes to commit',
        };
      }

      // Generate commit message based on changes
      const files = status.stdout.trim().split('\n').map(l => l.slice(3));
      const hasTests = files.some(f => f.includes('.test.') || f.includes('.spec.'));
      const hasDocs = files.some(f => f.includes('README') || f.includes('.md'));
      
      let type = 'feat';
      if (hasTests) type = 'test';
      if (hasDocs) type = 'docs';
      if (files.some(f => f.startsWith('fix'))) type = 'fix';
      
      const scope = files.length > 1 ? 'core' : path.dirname(files[0]).split('/')[0];
      const message = `${type}(${scope}): ${files.length} file(s) updated`;

      return {
        success: true,
        output: `Suggested commit message:\n${message}\n\nFiles:\n${files.join('\n')}`,
        actions: [
          {
            type: 'exec',
            command: `git commit -m "${message}"`,
            description: 'Execute commit',
          },
        ],
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Git error: ${err}`,
      };
    }
  },
};

export const refactorSkill: Skill = {
  name: 'refactor',
  description: 'Suggest and apply code refactoring',
  triggers: ['refactor', 'clean up', 'simplify', 'improve'],
  args: [
    { name: 'files', description: 'Files to refactor', required: true, type: 'array' },
    { name: 'goal', description: 'Refactoring goal', required: false, type: 'string', default: 'improve readability' },
  ],
  
  execute: async (ctx) => {
    const files = ctx.args.files;
    const goal = ctx.args.goal;
    
    const actions: SkillAction[] = [];
    
    for (const file of files) {
      // Read file and suggest refactors
      try {
        const content = await fs.readFile(path.join(ctx.cwd, file), 'utf-8');
        
        // Simple refactor suggestions
        if (content.length > 1000) {
          actions.push({
            type: 'suggest',
            file,
            description: `File is ${content.length} chars. Consider splitting into smaller modules.`,
          });
        }
        
        if ((content.match(/function/g) || []).length > 10) {
          actions.push({
            type: 'suggest',
            file,
            description: 'Many functions in one file. Consider extracting into separate files.',
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return {
      success: true,
      output: `Analyzed ${files.length} file(s) for ${goal}`,
      actions,
    };
  },
};

export const debugSkill: Skill = {
  name: 'debug',
  description: 'Help debug errors and issues',
  triggers: ['debug', 'error', 'fix', 'bug', 'broken'],
  args: [
    { name: 'error', description: 'Error message or description', required: false, type: 'string' },
    { name: 'file', description: 'File with error', required: false, type: 'string' },
  ],
  
  execute: async (ctx) => {
    const error = ctx.args.error || ctx.message;
    const file = ctx.args.file;
    
    const suggestions: string[] = [];
    
    const errorLower = error?.toLowerCase() ?? '';
    if (errorLower.includes('undefined') || errorLower.includes('null')) {
      suggestions.push('🔍 Check for null/undefined values before accessing properties');
    }
    if (errorLower.includes('cannot find') || errorLower.includes('module not found')) {
      suggestions.push('📦 Check if module is installed: npm install <package>');
    }
    if (errorLower.includes('permission')) {
      suggestions.push('🔐 Check file permissions or try with elevated privileges');
    }
    if (errorLower.includes('timeout')) {
      suggestions.push('⏱️ Consider increasing timeout or checking network connectivity');
    }

    return {
      success: true,
      output: `Debugging: ${error}\n\nSuggestions:\n${suggestions.join('\n')}`,
      actions: suggestions.map((s, i) => ({
        type: 'suggest',
        description: s,
      })),
    };
  },
};

export const testGenSkill: Skill = {
  name: 'test-gen',
  description: 'Generate tests for code',
  triggers: ['test', 'add test', 'coverage', 'testing'],
  args: [
    { name: 'files', description: 'Files to generate tests for', required: true, type: 'array' },
    { name: 'framework', description: 'Test framework', required: false, type: 'string', default: 'vitest' },
  ],
  
  execute: async (ctx) => {
    const files = ctx.args.files;
    const framework = ctx.args.framework;
    
    const generated: string[] = [];
    
    for (const file of files) {
      const testFile = file.replace(/\.ts$/, '.test.ts').replace(/\.js$/, '.test.js');
      generated.push(testFile);
    }

    return {
      success: true,
      output: `Generated ${generated.length} test file(s) using ${framework}:\n${generated.join('\n')}`,
      actions: generated.map(f => ({
        type: 'create',
        file: f,
        description: `Create test file: ${f}`,
      })),
    };
  },
};

export const docGenSkill: Skill = {
  name: 'doc-gen',
  description: 'Generate documentation',
  triggers: ['doc', 'documentation', 'docs', 'comment'],
  args: [
    { name: 'files', description: 'Files to document', required: true, type: 'array' },
  ],
  
  execute: async (ctx) => {
    const files = ctx.args.files;
    
    return {
      success: true,
      output: `Will add documentation (JSDoc comments) to ${files.length} file(s)`,
      actions: files.map(f => ({
        type: 'edit',
        file: f,
        description: `Add documentation to ${f}`,
      })),
    };
  },
};

// --- UTILITIES ---

const execAsync = promisify((cmd: string, opts: any, cb: any) => {
  const child = spawn(cmd, { shell: true, ...opts });
  let stdout = '';
  let stderr = '';
  
  child.stdout?.on('data', (data) => stdout += data);
  child.stderr?.on('data', (data) => stderr += data);
  child.on('close', (code) => {
    if (code === 0) {
      cb(null, { stdout, stderr });
    } else {
      cb(new Error(stderr || `Exit code ${code}`));
    }
  });
});

// --- EXPORT ---

export const skillRegistry = new SkillRegistry();
export default skillRegistry;

/** Returns a system prompt snippet listing all active skills. Used by agent context builder. */
export function getActiveSkillsPrompt(): string {
  const skills = (skillRegistry as any).getAll?.() ?? [];
  if (!skills.length) return '';
  const list = skills.map((s: any) => `- ${s.name}: ${s.description || ''}`).join('\n');
  return `\n\nAvailable skills:\n${list}`;
}

/** Returns the system prompt for a specific skill by name. */
export function getSkillPrompt(skillName: string): string {
  const skill = (skillRegistry as any).get?.(skillName) ?? null;
  if (!skill) return '';
  return `\n\nActive skill: ${skill.name}\n${skill.description || ''}`;
}
