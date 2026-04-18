/**
 * evals/harness.ts — Lightweight eval harness for Dirgha CLI.
 *
 * Runs a set of task definitions through the agent loop and scores the output.
 * Scoring uses simple string-match / regex assertions — no LLM judge required.
 *
 * Usage:
 *   import { runEvals } from './harness.js';
 *   const results = await runEvals(TASK_SUITE);
 */
import { runSingleTurn } from '../agent/loop.js';
import { getDefaultModel } from '../providers/detection.js';

export interface EvalTask {
  id: string;
  prompt: string;
  /** Expected output matchers — all must pass */
  expect: Array<string | RegExp>;
  /** Optional: if the output should NOT contain these */
  reject?: Array<string | RegExp>;
  /** Optional: custom scorer(output) → 0..1 */
  score?: (output: string) => number;
  timeoutMs?: number;
}

export interface EvalResult {
  id: string;
  passed: boolean;
  score: number;
  output: string;
  durationMs: number;
  failReason?: string;
}

function matchAll(output: string, matchers: Array<string | RegExp>): string | null {
  for (const m of matchers) {
    if (typeof m === 'string') {
      if (!output.includes(m)) return `Expected to contain: "${m}"`;
    } else {
      if (!m.test(output)) return `Expected to match: ${m}`;
    }
  }
  return null;
}

export async function runEval(task: EvalTask, model?: string): Promise<EvalResult> {
  const start = Date.now();
  const resolvedModel = model ?? getDefaultModel();
  let output = '';
  try {
    await runSingleTurn(task.prompt, resolvedModel, (t) => { output += t; }, () => {});
  } catch (err: any) {
    return { id: task.id, passed: false, score: 0, output, durationMs: Date.now() - start, failReason: err.message };
  }

  // Expect matchers
  const failExpect = matchAll(output, task.expect ?? []);
  if (failExpect) {
    return { id: task.id, passed: false, score: 0, output, durationMs: Date.now() - start, failReason: failExpect };
  }

  // Reject matchers
  if (task.reject) {
    for (const r of task.reject) {
      const hit = typeof r === 'string' ? output.includes(r) : r.test(output);
      if (hit) {
        return { id: task.id, passed: false, score: 0, output, durationMs: Date.now() - start, failReason: `Should NOT contain: "${r}"` };
      }
    }
  }

  const score = task.score ? task.score(output) : 1;
  return { id: task.id, passed: score >= 0.5, score, output, durationMs: Date.now() - start };
}

export async function runEvals(tasks: EvalTask[], model?: string): Promise<{
  results: EvalResult[];
  passed: number;
  failed: number;
  avgScore: number;
  totalMs: number;
}> {
  const results: EvalResult[] = [];
  const globalStart = Date.now();
  for (const task of tasks) {
    const result = await runEval(task, model);
    results.push(result);
    const status = result.passed ? '✓' : '✗';
    process.stderr.write(`  ${status} [${task.id}] ${result.durationMs}ms score=${result.score.toFixed(2)}`
      + (result.failReason ? ` — ${result.failReason}` : '') + '\n');
  }
  const passed = results.filter(r => r.passed).length;
  const avgScore = results.reduce((s, r) => s + r.score, 0) / (results.length || 1);
  return { results, passed, failed: results.length - passed, avgScore, totalMs: Date.now() - globalStart };
}

/** 20-task reference suite covering core capabilities */
export const TASK_SUITE: EvalTask[] = [
  { id: 'math-basic',    prompt: 'What is 17 * 23?',                       expect: ['391'] },
  { id: 'math-sqrt',     prompt: 'What is the square root of 144?',        expect: ['12'] },
  { id: 'math-fib',      prompt: 'What is the 10th Fibonacci number?',     expect: ['55'] },
  { id: 'code-py',       prompt: 'Write a Python one-liner to reverse a string s.', expect: ['[::-1]'] },
  { id: 'code-ts',       prompt: 'Write a TypeScript function that returns the sum of an array of numbers.', expect: ['reduce', 'number'] },
  { id: 'code-regex',    prompt: 'Write a regex to match email addresses.', expect: ['@'] },
  { id: 'fact-capital',  prompt: 'What is the capital of Japan?',          expect: ['Tokyo'] },
  { id: 'fact-element',  prompt: 'What is the chemical symbol for gold?',  expect: ['Au'] },
  { id: 'fact-planet',   prompt: 'How many planets are in our solar system?', expect: ['8'] },
  { id: 'logic-syllog',  prompt: 'All cats are animals. Felix is a cat. Is Felix an animal? Answer yes or no.', expect: ['yes', 'Yes'] },
  { id: 'logic-deduct',  prompt: 'If A implies B, and B implies C, does A imply C? Answer yes or no.', expect: ['yes', 'Yes'] },
  { id: 'format-json',   prompt: 'Return a valid JSON object with keys "name" and "age" — no explanation.', expect: ['{', '"name"', '"age"', '}'] },
  { id: 'format-list',   prompt: 'List 3 programming languages as a bulleted list.', expect: ['-', '\n'] },
  { id: 'coderead-bug',  prompt: 'In this JS: `function add(a,b) { return a - b; }` — is there a bug? Yes or no?', expect: ['yes', 'Yes'] },
  { id: 'transform-upper', prompt: 'Convert to uppercase: hello world', expect: ['HELLO', 'WORLD'] },
  { id: 'transform-snake', prompt: 'Convert camelCase to snake_case: myVariableName', expect: ['my_variable_name'] },
  { id: 'step-by-step',  prompt: 'Show me step by step how to compute 5!', expect: ['120'] },
  { id: 'negation',      prompt: 'What is NOT true about penguins? They can fly? Answer: can they fly?', expect: ['no', 'No', 'cannot', 'can\'t'] },
  { id: 'context',       prompt: 'My name is Alice. What is my name?',     expect: ['Alice'] },
  { id: 'long-output',   prompt: 'List the first 5 prime numbers.',        expect: ['2', '3', '5', '7', '11'] },
];
