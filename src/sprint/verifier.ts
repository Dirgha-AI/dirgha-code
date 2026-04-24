import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { glob } from 'glob';
import type { SprintTask, VerificationResult } from './types.js';

export async function verify(task: SprintTask, cwd: string): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  for (const criterion of task.verification) {
    const start = Date.now();
    
    try {
      switch (criterion.type) {
        case 'file_exists': {
          if (!criterion.path) throw new Error('file_exists criterion requires `path`');
          const fullPath = path.resolve(cwd, criterion.path);
          const exists = fs.existsSync(fullPath);
          results.push({
            type: criterion.type,
            passed: exists,
            detail: exists ? 'exists' : `not found: ${criterion.path}`,
            durationMs: Date.now() - start
          });
          break;
        }

        case 'file_count': {
          if (!criterion.glob) throw new Error('file_count criterion requires `glob`');
          const files = await glob(criterion.glob, { cwd });
          const count = files.length;
          const min = criterion.min ?? 0;
          const passed = count >= min;
          results.push({
            type: criterion.type,
            passed,
            detail: `found ${count} files (min: ${min})`,
            durationMs: Date.now() - start
          });
          break;
        }

        case 'build':
        case 'test':
        case 'type_check':
        case 'shell': {
          const commandCwd = criterion.cwd || cwd;
          const timeout = (criterion.timeout_seconds || 120) * 1000;
          const expectExit = criterion.expect_exit ?? 0;
          
          let stdout = '';
          let stderr = '';
          let exitCode = 0;
          
          if (!criterion.command) throw new Error(`${criterion.type} criterion requires \`command\``);
          try {
            const output = execSync(criterion.command, {
              cwd: commandCwd, 
              timeout, 
              stdio: 'pipe',
              encoding: 'utf-8'
            });
            stdout = output;
          } catch (error: any) {
            exitCode = error.status ?? 1;
            stdout = error.stdout?.toString() ?? '';
            stderr = error.stderr?.toString() ?? '';
          }
          
          const passed = exitCode === expectExit;
          let detail = `exit code: ${exitCode} (expected: ${expectExit})`;
          
          if (!passed) {
            const output = (stdout + '\n' + stderr).slice(0, 500);
            detail += ` | output: ${output}`;
          }
          
          results.push({
            type: criterion.type,
            passed,
            detail,
            durationMs: Date.now() - start
          });
          break;
        }

        case 'contains': {
          if (!criterion.path) throw new Error('contains criterion requires `path`');
          if (!criterion.must_contain) throw new Error('contains criterion requires `must_contain`');
          const fullPath = path.resolve(cwd, criterion.path);
          const content = fs.readFileSync(fullPath, 'utf-8');
          const mustContain: string[] = Array.isArray(criterion.must_contain)
            ? criterion.must_contain
            : [criterion.must_contain];
          const missing = mustContain.filter(str => !content.includes(str));
          const passed = missing.length === 0;
          
          results.push({
            type: criterion.type,
            passed,
            detail: passed ? 'all strings found' : `missing: ${missing.join(', ')}`,
            durationMs: Date.now() - start
          });
          break;
        }

        case 'llm_judge': {
          const model = criterion.model || 'haiku';
          const threshold = criterion.pass_threshold || 0.8;
          const prompt = criterion.prompt;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);
          
          try {
            const response = await fetch('http://localhost:3001/api/intelligence', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt, model }),
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json() as { passed: boolean; confidence: number };
            const passed = data.passed && data.confidence >= threshold;
            
            results.push({
              type: criterion.type,
              passed,
              detail: `confidence: ${data.confidence}`,
              durationMs: Date.now() - start
            });
          } catch (error: any) {
            clearTimeout(timeoutId);
            throw error;
          }
          break;
        }

        default: {
          results.push({
            type: criterion.type,
            passed: false,
            detail: `unknown criterion type: ${criterion.type}`,
            durationMs: Date.now() - start
          });
        }
      }
    } catch (error: any) {
      results.push({
        type: criterion.type,
        passed: false,
        detail: `error: ${error.message}`,
        durationMs: Date.now() - start
      });
    }
  }

  return results;
}
