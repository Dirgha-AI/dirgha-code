/** tools/git.ts — Git tools: status, diff, log, commit, checkpoint, branch, push, patch, stash
 *  All operations are async — git never blocks the event loop or freezes the REPL.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ToolResult } from '../types.js';

function git(args: string[], timeoutMs = 15_000): Promise<{ out: string; err: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
        SSH_ASKPASS: 'echo',
        GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new',
      },
    });

    let out = '';
    let err = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });

    const timer = setTimeout(() => proc.kill('SIGTERM'), timeoutMs);
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ out: out.trim(), err: err.trim(), code });
    });
  });
}

export async function gitStatusTool(): Promise<ToolResult> {
  const { out, err, code } = await git(['status', '--short', '--branch'], 8_000);
  if (code !== 0) return { tool: 'git_status', result: '', error: err || 'Not a git repo' };
  return { tool: 'git_status', result: out };
}

export async function gitDiffTool(input: Record<string, any>): Promise<ToolResult> {
  const args = ['diff'];
  if (input['staged']) args.push('--cached');
  if (input['path']) args.push('--', input['path'] as string);
  const { out } = await git(args, 8_000);
  return { tool: 'git_diff', result: (out || '(no changes)').slice(0, 20_000) };
}

export async function gitLogTool(input: Record<string, any>): Promise<ToolResult> {
  const n = (input['n'] as number) ?? 10;
  const { out, err, code } = await git(['log', '--oneline', `-${n}`], 8_000);
  if (code !== 0) return { tool: 'git_log', result: '', error: err || 'Not a git repo' };
  return { tool: 'git_log', result: out };
}

export async function gitCommitTool(input: Record<string, any>): Promise<ToolResult> {
  await git(['add', '-A'], 10_000);
  const { out, err, code } = await git(['commit', '-m', input['message'] as string], 15_000);
  if (code !== 0) return { tool: 'git_commit', result: '', error: (err || out || 'commit failed') };
  return { tool: 'git_commit', result: out };
}

export async function checkpointTool(input: Record<string, any>): Promise<ToolResult> {
  const { out, err, code } = await git(['stash', 'push', '-m', `checkpoint: ${input['description']}`], 10_000);
  if (code !== 0) return { tool: 'checkpoint', result: '', error: err || 'stash failed' };
  return { tool: 'checkpoint', result: `Checkpoint saved: ${input['description']}\n${out}` };
}

export async function gitBranchTool(input: Record<string, any>): Promise<ToolResult> {
  if (input['name']) {
    const args = input['checkout'] ? ['checkout', '-b', input['name']] : ['branch', input['name']];
    const { out, err, code } = await git(args, 8_000);
    if (code !== 0) return { tool: 'git_branch', result: '', error: err };
    return { tool: 'git_branch', result: out || `Branch ${input['name']} created` };
  }
  const { out, err, code } = await git(['branch', '-a', '--sort=-committerdate'], 8_000);
  if (code !== 0) return { tool: 'git_branch', result: '', error: err };
  return { tool: 'git_branch', result: out };
}

export async function gitPushTool(input: Record<string, any>): Promise<ToolResult> {
  const args = ['push'];
  if (input['force']) args.push('--force-with-lease');
  if (input['remote']) args.push(input['remote'] as string);
  if (input['branch']) args.push(input['branch'] as string);
  const { out, err, code } = await git(args, 60_000); // push can be slow
  if (code !== 0) return { tool: 'git_push', result: '', error: (err || out || 'push failed') };
  return { tool: 'git_push', result: out || err || 'Pushed successfully' };
}

export async function gitStashTool(input: Record<string, any>): Promise<ToolResult> {
  const sub = (input['action'] as string) ?? 'list';
  const args = sub === 'pop'   ? ['stash', 'pop']
    : sub === 'apply' ? ['stash', 'apply', ...(input['index'] ? [`stash@{${input['index']}}`] : [])]
    : sub === 'drop'  ? ['stash', 'drop',  ...(input['index'] ? [`stash@{${input['index']}}`] : [])]
    : ['stash', 'list'];
  const { out, err, code } = await git(args, 10_000);
  if (code !== 0) return { tool: 'git_stash', result: '', error: err };
  return { tool: 'git_stash', result: out || `stash ${sub} ok` };
}

export async function gitPatchTool(input: Record<string, any>): Promise<ToolResult> {
  const patch = input['patch'] as string;
  if (!patch) return { tool: 'git_patch', result: '', error: 'patch is required' };
  const tmpFile = join(tmpdir(), `dirgha_patch_${Date.now()}.patch`);
  try {
    writeFileSync(tmpFile, patch, 'utf8');
    const { out: ao, err: ae, code: ac } = await git(['apply', '--index', tmpFile], 10_000);
    if (ac !== 0) return { tool: 'git_patch', result: '', error: (ae || 'patch apply failed') };
    if (input['commit']) {
      const msg = (input['message'] as string) || 'chore: apply patch';
      const { err: ce, code: cc } = await git(['commit', '-m', msg], 15_000);
      if (cc !== 0) return { tool: 'git_patch', result: '', error: ce };
      return { tool: 'git_patch', result: `Patch applied + committed: ${msg}` };
    }
    return { tool: 'git_patch', result: ao || 'Patch applied (staged, not yet committed)' };
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ok */ }
  }
}

export async function gitAutoMessageTool(): Promise<ToolResult> {
  const { out: diffText } = await git(['diff', '--cached', '--stat'], 8_000);
  if (!diffText) return { tool: 'git_auto_message', result: '', error: 'No staged changes' };
  const { runSingleTurn } = await import('../agent/loop.js');
  const { getDefaultModel } = await import('../providers/detection.js');
  let msg = '';
  await runSingleTurn(
    `Write a single-line conventional commit message (max 72 chars) for this diff.\nDo NOT include fences, quotes, or explanation — just the message.\n\n${diffText.slice(0, 3000)}`,
    getDefaultModel(),
    (t) => { msg += t; },
    () => {},
  );
  return { tool: 'git_auto_message', result: msg.trim().split('\n')[0]?.slice(0, 72) ?? '' };
}
