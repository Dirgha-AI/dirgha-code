/**
 * `dirgha verify` — run an agent task with a shell-command acceptance
 * gate. The agent runs the goal, then we exec the acceptance command:
 * exit 0 = pass, any non-zero = fail. Returns 0 only when both the
 * agent loop ends cleanly AND the acceptance gate passes.
 *
 * Usage:
 *   dirgha verify "<goal>" --accept "<shell command>"
 *                          [-m <model>] [--max-turns N]
 *                          [--retries N]
 *
 * Examples:
 *   dirgha verify "Add a sum() to math.py" \
 *     --accept "python -c 'from math import sum; assert sum([1,2])==3'"
 *
 *   dirgha verify "Wire CORS into the gateway" \
 *     --accept "curl -fs -H 'Origin: https://x' http://localhost:3000/api/health" \
 *     --retries 2
 */

import { spawn } from 'node:child_process';
import { stdout, stderr, exit as procExit } from 'node:process';
import { randomUUID } from 'node:crypto';
import { runAgentLoop } from '../../kernel/agent-loop.js';
import { createEventStream } from '../../kernel/event-stream.js';
import type { Message } from '../../kernel/types.js';
import { ProviderRegistry } from '../../providers/index.js';
import { builtInTools, createToolExecutor, createToolRegistry } from '../../tools/index.js';
import { renderStreamingEvents } from '../../tui/renderer.js';
import { loadConfig } from '../config.js';
import { parseFlags } from '../flags.js';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

interface VerifyResult {
  goal: string;
  acceptCmd: string;
  agentStopReason: string;
  agentOk: boolean;
  acceptExit: number;
  acceptStdout: string;
  acceptStderr: string;
  attempts: number;
}

async function runShell(cmd: string, cwd: string, timeoutMs: number): Promise<{ exit: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(cmd, { shell: true, cwd });
    let out = '';
    let err = '';
    let killed = false;
    const t = setTimeout(() => { killed = true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', d => { out += d.toString('utf8'); });
    child.stderr.on('data', d => { err += d.toString('utf8'); });
    child.on('close', code => {
      clearTimeout(t);
      resolve({ exit: killed ? 124 : (code ?? 1), stdout: out, stderr: err });
    });
  });
}

export const verifySubcommand: Subcommand = {
  name: 'verify',
  description: 'Run an agent task and gate completion on an acceptance shell command',
  async run(argv): Promise<number> {
    const { flags, positionals } = parseFlags(argv);
    const goal = (positionals[0] ?? '').trim();
    const accept = typeof flags.accept === 'string' ? flags.accept : (typeof flags.a === 'string' ? flags.a : '');
    if (!goal || !accept) {
      stderr.write('usage: dirgha verify "<goal>" --accept "<shell command>"\n');
      return 2;
    }

    const config = await loadConfig();
    const { resolveModelAlias } = await import('../../intelligence/prices.js');
    const rawModel = typeof flags.model === 'string' ? flags.model : (typeof flags.m === 'string' ? flags.m : config.model);
    const model = resolveModelAlias(rawModel);
    const maxTurns = typeof flags['max-turns'] === 'string' ? Number.parseInt(flags['max-turns'], 10) : config.maxTurns;
    const retries = typeof flags.retries === 'string' ? Number.parseInt(flags.retries, 10) : 0;
    const acceptTimeoutMs = typeof flags['accept-timeout'] === 'string' ? Number.parseInt(flags['accept-timeout'], 10) : 60_000;
    const json = flags.json === true;

    const providers = new ProviderRegistry();
    const registry = createToolRegistry(builtInTools);

    let lastResult: VerifyResult | null = null;
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      const sessionId = randomUUID();
      const events = createEventStream();
      if (!json) events.subscribe(renderStreamingEvents({ showThinking: config.showThinking }));
      const executor = createToolExecutor({ registry, cwd: process.cwd(), sessionId });
      const sanitized = registry.sanitize({ descriptionLimit: 200 });

      const messages: Message[] = [
        { role: 'system', content: `You are completing a goal that will be verified by an automated check after you finish. Use tools to make real changes. The check is: \`${accept}\` — when it exits 0, you have succeeded. Aim for the smallest change that passes the check.` },
        { role: 'user', content: goal },
      ];

      stdout.write(style(defaultTheme.accent, `\nattempt ${attempt}/${retries + 1}: ${goal}\n`));
      const result = await runAgentLoop({
        sessionId,
        model,
        messages,
        tools: sanitized.definitions,
        maxTurns,
        provider: providers.forModel(model),
        toolExecutor: executor,
        events,
      }).catch(err => ({ stopReason: 'error' as const, messages, usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 }, turnCount: 0, sessionId, error: err }));

      const agentOk = result.stopReason !== 'error' && result.stopReason !== 'aborted';
      stdout.write('\n');
      stdout.write(style(defaultTheme.muted, `agent: ${result.stopReason}\n`));

      stdout.write(style(defaultTheme.accent, `\nacceptance: ${accept}\n`));
      const accepted = await runShell(accept, process.cwd(), acceptTimeoutMs);
      const passed = accepted.exit === 0;
      stdout.write(style(passed ? defaultTheme.success : defaultTheme.danger, `${passed ? '✓ PASS' : '✗ FAIL'} (exit=${accepted.exit})\n`));
      if (accepted.stdout.trim()) stdout.write(`  stdout: ${accepted.stdout.trim().slice(0, 400)}\n`);
      if (accepted.stderr.trim()) stdout.write(`  stderr: ${accepted.stderr.trim().slice(0, 400)}\n`);

      lastResult = {
        goal,
        acceptCmd: accept,
        agentStopReason: result.stopReason,
        agentOk,
        acceptExit: accepted.exit,
        acceptStdout: accepted.stdout,
        acceptStderr: accepted.stderr,
        attempts: attempt,
      };

      if (passed) {
        if (json) stdout.write(JSON.stringify(lastResult, null, 2) + '\n');
        return 0;
      }
      if (attempt <= retries) {
        stdout.write(style(defaultTheme.muted, `retrying (${retries - attempt + 1} attempts left)…\n`));
      }
    }

    if (json && lastResult) stdout.write(JSON.stringify(lastResult, null, 2) + '\n');
    return 1;
  },
};

void procExit;
