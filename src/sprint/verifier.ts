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
          const fullPath = path.resolve(cwd, (criterion as any).path);
          const exists = fs.existsSync(fullPath);
          results.push({
            type: criterion.type,
            passed: exists,
            detail: exists ? 'exists' : `not found: ${(criterion as any).path}`,
            durationMs: Date.now() - start
          });
          break;
        }

        case 'file_count': {
          const files = await glob((criterion as any).glob, { cwd });
          const count = files.length;
          const min = (criterion as any).min;
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
          const commandCwd = (criterion as any).cwd || cwd;
          const timeout = ((criterion as any).timeout_seconds || 120) * 1000;
          const expectExit = (criterion as any).expect_exit ?? 0;
          
          let stdout = '';
          let stderr = '';
          let exitCode = 0;
          
          try {
            const output = execSync((criterion as any).command, { 
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
          const fullPath = path.resolve(cwd, (criterion as any).path);
          const content = fs.readFileSync(fullPath, 'utf-8');
          const mustContain: string[] = (criterion as any).must_contain;
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
          const model = (criterion as any).model || 'haiku';
          const threshold = (criterion as any).pass_threshold || 0.8;
          const prompt = (criterion as any).prompt;
          
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
