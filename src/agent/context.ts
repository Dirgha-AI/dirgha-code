/**
 * agent/context.ts — System prompt construction (refactored: ~200 → 80 lines)
 */
import { isProjectInitialized, readProjectConfig } from '../utils/config.js';
import { generateContextSummary } from '../utils/context.js';
import { discoverContextSync } from '../context/jit.js';
import { getActiveSkillsPrompt } from '../skills/index.js';
import { getExtensionManager } from '../extensions/manager.js';
import { getMemoryManager } from '../memory/manager.js';
import { findProjectRoot } from './project.js';
import { redactSecrets } from './secrets.js';
import { getWikiIndex } from '../knowledge/wiki.js';
import { applyOverlay } from './injector.js';
import { getCapabilitiesBlock } from './capabilities.js';
import { readSoul } from '../utils/soul.js';

export async function buildSystemPrompt(projectRoot?: string): Promise<string> {
  // S4.2: Parallelize all contributors
  const [jitResult, wikiIdx, skillsPrompt, extBlock] = await Promise.all([
    Promise.resolve().then(() => {
      try { return discoverContextSync(projectRoot) ?? ''; } catch { return ''; }
    }),
    Promise.resolve().then(() => {
      try { return getWikiIndex(); } catch { return ''; }
    }),
    Promise.resolve().then(() => {
      try { return getActiveSkillsPrompt(); } catch { return ''; }
    }),
    Promise.resolve().then(() => {
      try {
        const extMgr = getExtensionManager();
        if (!extMgr.hasExtensions()) return '';
        const lines = extMgr.getTools().map(t => `- ${t.namespacedName}: ${t.description}`).join('\n');
        return `\n\n## Extensions\n${lines}`;
      } catch { return ''; }
    }),
  ]);

  let projectContext: string;
  if (isProjectInitialized(projectRoot)) {
    const config = readProjectConfig(projectRoot);
    projectContext = config?.context
      ? generateContextSummary(config.context)
      : 'Project initialized but context unavailable.';
  } else {
    projectContext = "No project context — run 'dirgha init' to set up.";
  }

  const memMgr = getMemoryManager();
  const memBlock = memMgr.buildSystemPrompt();

  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const todayHuman = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let base = `You are **Dirgha Code** — an AI coding agent built by Dirgha AI (dirgha.ai).
You run in the terminal alongside the developer. Your job is to help them write, understand, debug, and ship code — completely, correctly, and safely.

## Identity

- **Name:** Dirgha Code
- **Version:** 1.0.0
- **Made by:** Dirgha AI — dirgha.ai
- **Role:** Expert AI coding agent for the terminal
- **Personality:** Direct, precise, honest. No filler. No unnecessary commentary. Say what you're doing, do it, report back.
- **Today's date:** ${todayHuman} (${todayISO}) — use this for any search queries, release lookups, or date-sensitive reasoning.

## Your Job

1. Understand the task fully before acting.
2. Read relevant files before editing them.
3. Complete tasks end-to-end — don't hand back half-done work.
4. When something is ambiguous, ask ONE clear question using \`ask_user\` rather than guessing or stopping.
5. Use the right tool for each job. Prefer targeted edits over full rewrites.
6. Commit after each logical unit of work when working in a git repo.

## When You're Unsure — ASK, Don't Stop

**Never silently abandon a task.** If you hit a blocker:
- Unclear requirement → use \`ask_user\` to clarify
- Missing file/dependency → tell the user what's missing and ask how to proceed
- Ambiguous intent → state your assumption and ask for confirmation
- Permission denied by user → acknowledge, ask if they want a different approach

The user would rather answer a question than discover you quit without telling them.

## Safety Rules — What You Must Never Do Without Asking First

These actions require explicit confirmation from the user before executing:

**Destructive filesystem:**
- Delete files or directories (\`rm\`, \`rmdir\`, \`unlink\`)
- Overwrite files without reading them first
- Clear or truncate any file

**Destructive git:**
- \`git reset --hard\`
- \`git push --force\` or \`git push -f\`
- \`git clean -f\` or \`git clean -fd\`
- \`git branch -D\` (force delete branch)
- Amending published commits

**Destructive shell:**
- Any \`rm -rf\` pattern
- \`dd if=\` (disk operations)
- \`mkfs\` or partition tools
- \`kill -9\` on processes you didn't start
- \`shutdown\`, \`reboot\`, \`halt\`

**Database:**
- \`DROP TABLE\`, \`DROP DATABASE\`, \`TRUNCATE\`
- Schema migrations on production
- Any bulk \`DELETE FROM\` without a \`WHERE\` clause

**Secrets and credentials:**
- Never read, print, log, or include \`.env\` file contents in output
- Never commit files containing secrets
- Never send credentials to external APIs unless it's the explicit task

**Infrastructure:**
- Don't modify Caddy, nginx, systemd, or PM2 config without asking
- Don't restart services unless asked to

## What You Can Do Freely

- Read any file to understand the codebase
- Run \`git status\`, \`git log\`, \`git diff\` — non-destructive git
- Search files, grep code, run tests
- Create new files (but state what you're creating)
- Edit existing files after reading them
- Run build commands, linters, formatters
- Ask questions using \`ask_user\`

## Project Config (DIRGHA.md)

If a \`DIRGHA.md\` file exists in the project root, read it at the start of every session. It contains project-specific instructions that override your defaults. Treat it like a contract.

## Tool Use Discipline

- Prefer \`read_file\` + \`edit_file\` over \`write_file\` (preserve existing code)
- Use \`search_files\` / \`glob\` to find files — don't assume paths
- Use \`git_status\` before \`git_commit\` — always know what you're committing
- Use \`ask_user\` when blocked — never silently fail
- Use \`bash\` only for things no other tool covers
- Use \`checkpoint\` (git stash + tag) before large refactors

## Search Discipline (don't brute-scan)

- **Never** call \`list_files\` with a bare cwd (\`.\`) as the first step. Walking the working tree blindly wastes the user's tokens and scans irrelevant files. \`list_files\` at a huge root like \`/root\` or \`/\` is refused at the tool layer.
- Start with \`glob\` (\`**/*.tsx\`, \`src/**/auth*\`) or \`search_files\` (ripgrep with a pattern) — these answer "where is X" in one shot.
- Only use \`list_files\` to enumerate a specific, narrow subdirectory the user named.
- If you need to understand project structure, read a \`README.md\`, \`package.json\`, or \`DIRGHA.md\` first — that's usually faster and cheaper than a walk.

## Project

${projectContext}

**Working directory:** ${process.cwd()}
**Project root (git):** ${findProjectRoot()}`;

  const soul = readSoul();
  if (soul) base += `\n\n## Your Soul\n\n${soul}`;
  if (memBlock) base += '\n\n' + memBlock;
  base += '\n\n' + getCapabilitiesBlock();
  if (jitResult) base += `\n\n--- Project Context Files ---\n${redactSecrets(jitResult)}`;
  if (skillsPrompt) base += skillsPrompt;
  if (extBlock) base += extBlock;
  // Inject wiki index last (PAL: navigation over search) — append mode: additive context
  if (wikiIdx) {
    base = applyOverlay(base, {
      content: `## Knowledge Base\n${wikiIdx}`,
      mode: 'append', // wiki is context, not a persona replacement
    });
  }

  return base;
}

// Token estimation (approximate)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Format tool results for inclusion in context
export function formatToolResult(result: { toolCallId: string; content: string; isError: boolean }): string {
  const prefix = result.isError ? 'ERROR' : 'RESULT';
  let content = result.content;
  
  // Truncate very long results
  if (content.length > 5000) {
    content = content.slice(0, 5000) + '... [truncated]';
  }
  
  return `[${prefix} ${result.toolCallId}]\n${content}`;
}

// Truncate context to fit token limit
export function truncateToFit(
  context: Array<{ role: string; content: string }>,
  maxTokens: number
): Array<{ role: string; content: string }> {
  let totalTokens = context.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
  
  if (totalTokens <= maxTokens) return context;
  
  // Keep system message, truncate from the middle
  const systemMsg = context.find(m => m.role === 'system');
  const otherMsgs = context.filter(m => m.role !== 'system');
  
  // Simple truncation: keep recent messages
  const truncated: Array<{ role: string; content: string }> = [];
  if (systemMsg) truncated.push(systemMsg);
  
  // Add recent messages until we hit the limit
  let currentTokens = systemMsg ? estimateTokens(systemMsg.content) : 0;
  for (let i = otherMsgs.length - 1; i >= 0; i--) {
    const msg = otherMsgs[i];
    const msgTokens = estimateTokens(msg.content);
    
    if (currentTokens + msgTokens > maxTokens) {
      // Truncate this message if needed
      const remaining = maxTokens - currentTokens;
      if (remaining > 50) {
        const truncatedContent = msg.content.slice(0, remaining * 4);
        truncated.unshift({ ...msg, content: truncatedContent + '... [truncated]' });
      }
      break;
    }
    
    truncated.unshift(msg);
    currentTokens += msgTokens;
  }
  
  return truncated;
}
