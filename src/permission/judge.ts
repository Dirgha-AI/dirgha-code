/**
 * permission/judge.ts — Classify tool calls and decide if confirmation is needed.
 */
import { isYoloEnabled } from '../commands/yolo.js';

const READ_ONLY_TOOLS = new Set([
  'read_file', 'search_files', 'list_files', 'glob', 'repo_map',
  'git_status', 'git_diff', 'git_log', 'web_fetch', 'web_search',
  'search_knowledge', 'read_memory', 'qmd_search',
]);

export type ToolClass = 'read' | 'write';

export function classifyTool(toolName: string): ToolClass {
  return READ_ONLY_TOOLS.has(toolName) ? 'read' : 'write';
}

// ---------------------------------------------------------------------------
// Dangerous command patterns — irreversible or high-risk shell commands
// ---------------------------------------------------------------------------

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /rm\s+(-rf?|--recursive|-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\s/i, description: 'recursive file deletion' },
  { pattern: /rm\s+-[a-z]*f/i, description: 'forced file deletion' },
  { pattern: /rmdir\s/i, description: 'directory removal' },
  { pattern: /mkfs\b/i, description: 'filesystem format' },
  { pattern: /dd\s+if=/i, description: 'raw disk write (dd)' },
  { pattern: />\s*\/dev\/sd/i, description: 'overwrite block device' },
  { pattern: /chmod\s+(-R\s+)?[0-7]{3,4}\s+\//i, description: 'recursive chmod on root path' },
  { pattern: /chown\s+-R\s/i, description: 'recursive chown' },
  { pattern: /kill\s+-9\s/i, description: 'force kill process' },
  { pattern: /killall\s/i, description: 'kill all matching processes' },
  { pattern: /pkill\s/i, description: 'pattern-based process kill' },
  { pattern: /shutdown\b/i, description: 'system shutdown' },
  { pattern: /reboot\b/i, description: 'system reboot' },
  { pattern: /systemctl\s+(stop|disable|mask)\s/i, description: 'stop/disable systemd service' },
  { pattern: /git\s+push\s+(-f|--force)/i, description: 'git force push' },
  { pattern: /git\s+reset\s+--hard/i, description: 'git hard reset' },
  { pattern: /git\s+clean\s+-f/i, description: 'git clean (force delete untracked)' },
  { pattern: /git\s+branch\s+-D/i, description: 'force delete git branch' },
  { pattern: /git\s+checkout\s+--\s/i, description: 'git discard file changes' },
  { pattern: /DROP\s+(TABLE|DATABASE|SCHEMA)/i, description: 'SQL DROP statement' },
  { pattern: /TRUNCATE\s+TABLE/i, description: 'SQL TRUNCATE' },
  { pattern: /DELETE\s+FROM\s+\w+\s*(;|\s*$)/i, description: 'SQL DELETE without WHERE' },
  { pattern: /ALTER\s+TABLE.*DROP/i, description: 'SQL ALTER TABLE DROP' },
  { pattern: /npm\s+unpublish/i, description: 'npm unpublish' },
  { pattern: /docker\s+(rm|rmi)\s+-f/i, description: 'force remove docker container/image' },
  { pattern: /docker\s+system\s+prune/i, description: 'docker system prune' },
  { pattern: /kubectl\s+delete/i, description: 'kubectl delete resource' },
  { pattern: /terraform\s+destroy/i, description: 'terraform destroy' },
  { pattern: /curl.*\|\s*(ba)?sh/i, description: 'pipe curl to shell' },
  { pattern: /wget.*\|\s*(ba)?sh/i, description: 'pipe wget to shell' },
  { pattern: /eval\s*\(/i, description: 'eval() execution' },
  { pattern: />\s*\/etc\//i, description: 'overwrite system config file' },
  { pattern: /sudo\s/i, description: 'sudo privilege escalation' },
  { pattern: /su\s+-/i, description: 'switch user' },
  { pattern: /passwd\b/i, description: 'password change' },
  { pattern: /iptables\s+-F/i, description: 'flush firewall rules' },
  { pattern: /pm2\s+delete\s+all/i, description: 'pm2 delete all processes' },
  { pattern: /pm2\s+kill/i, description: 'pm2 kill daemon' },
];

/**
 * Check if a command matches a dangerous pattern.
 * Returns a human-readable description of the matched danger, or null if safe.
 */
export function isDangerousCommand(command: string): string | null {
  for (const { pattern, description } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) return description;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Read-only path protection (Mintlify pattern)
// ---------------------------------------------------------------------------

const READ_ONLY_GLOB_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'out',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.env',
  '.env.local',
  '.env.production',
  '~/.ssh',
  '~/.dirgha/credentials.json',
];

/**
 * Returns the matched pattern name if the path is write-protected, null if safe to write.
 * Matches on full path components (/, end-of-string) to avoid false positives.
 */
export function isReadOnlyPath(filePath: string): string | null {
  const norm = filePath.replace(/\\/g, '/');
  const parts = norm.split('/');

  for (const pattern of READ_ONLY_GLOB_PATTERNS) {
    if (pattern.startsWith('*')) {
      // Glob extension match — e.g. *.lock → check last component
      const ext = pattern.slice(1); // e.g. '.lock'
      const lastName = parts[parts.length - 1] ?? '';
      if (lastName.endsWith(ext)) return pattern;
    } else if (pattern.startsWith('~')) {
      // Absolute path with home dir
      const home = process.env['HOME'] ?? '/root';
      const expanded = pattern.replace('~', home);
      if (norm === expanded || norm.startsWith(expanded + '/')) return pattern;
    } else {
      // Component match: pattern must be an exact path component or directory
      if (parts.includes(pattern)) return pattern;
    }
  }
  return null;
}

/**
 * Returns true if the tool call requires interactive confirmation before running.
 *
 * Rules:
 *   1. If the tool is run_command/bash and the command matches a dangerous pattern,
 *      ALWAYS require confirmation regardless of permission level.
 *   2. DangerFullAccess  → never needs confirmation (unless dangerous command)
 *   3. Allow             → never needs confirmation (unless dangerous command)
 *   4. WorkspaceWrite    → never needs confirmation (unless dangerous command)
 *   5. ReadOnly          → confirmation required for any write tool
 *   6. Prompt            → confirmation required for any write tool
 */
export function needsConfirmation(
  toolName: string,
  permissionLevel: string,
  toolInput?: Record<string, unknown>,
): boolean {
  // Yolo mode short-circuit: bypass confirmation based on configured danger level
  if (isYoloEnabled('all')) {
    // 'all' level: bypass everything, including dangerous commands
    return false;
  }
  if (isYoloEnabled('medium')) {
    // 'medium' level: bypass all write tools EXCEPT dangerous shell commands
    const isShellCmd = toolName === 'run_command' || toolName === 'bash';
    const hasDanger = isShellCmd && toolInput?.command
      ? isDangerousCommand(String(toolInput.command)) !== null
      : false;
    if (!hasDanger) return false;
  }
  // 'safe' level (isYoloEnabled() with no arg): read tools are already non-confirming;
  // no additional bypass needed — fall through to standard logic.

  // Always flag dangerous shell commands, regardless of permission level
  if ((toolName === 'run_command' || toolName === 'bash') && toolInput?.command) {
    const danger = isDangerousCommand(String(toolInput.command));
    if (danger) return true;
  }

  if (permissionLevel === 'DangerFullAccess' || permissionLevel === 'Allow') return false;
  if (permissionLevel === 'WorkspaceWrite') return false;
  if (classifyTool(toolName) === 'write') {
    return permissionLevel === 'ReadOnly' || permissionLevel === 'Prompt';
  }
  return false;
}
