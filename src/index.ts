// Build-injected version constant (replaced by esbuild define at build time)
declare const __CLI_VERSION__: string;
const _cliVersion = typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : '0.0.0';

// ── Fast-paths that exit before we import anything heavy.
// The full command module tree (Ink, sqlite, libp2p, react) takes ~800ms to
// cold-load. Users running `dirgha --version` in scripts or CI shouldn't wait
// for that. Same for `dirgha agent ...` — that's the headless machine-readable
// JSON mode, explicitly designed to bypass the TUI.
{
  const _argv = process.argv.slice(2);
  if (_argv[0] === '--version' || _argv[0] === '-V') {
    process.stdout.write(_cliVersion + '\n');
    process.exit(0);
  }
  if (_argv[0] === 'agent') {
    // Lazy-load only the agent-mode module graph. No Ink, no pickers.
    // Load BYOK keys first so callNvidia / callFireworks / callAnthropic find
    // their env vars — without this, `dirgha agent chat --model <nvidia model>`
    // throws "NVIDIA_API_KEY not set" even when the key sits in ~/.dirgha/keys.json.
    import('./utils/keys.js')
      .then(({ loadKeysIntoEnv }) => loadKeysIntoEnv())
      .then(() => import('./agent/index.js'))
      .then(m => m.runAgentMode(_argv.slice(1)))
      .then(code => process.exit(code))
      .catch(err => {
        process.stderr.write(`agent mode error: ${err?.message ?? err}\n`);
        process.exit(1);
      });
    // Block event-loop drain while the promise runs. The rest of index.ts is
    // guarded below by the same `_argv[0] === 'agent'` check so commander
    // doesn't race the async import and bark "unknown command 'agent'".
    setInterval(() => {}, 1 << 30);
  }
}

// If the fast-path above claimed the 'agent' command, skip everything below —
// commander would otherwise parse argv synchronously and fail before the lazy
// import of agent/index.js resolves.
const _fastPathClaimed = process.argv[2] === 'agent';

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { execCmd } from './utils/safe-exec.js';
import { redactSecrets } from './agent/secrets.js';
export { redactSecrets };

// Stores a pending update nudge message — set by background check below
let _updateNudge: string | undefined;

// ── Crash reporter — write uncaught errors to ~/.dirgha/crash.log ─────────────

function sanitizeCrashLog(text: string): string {
  const home = os.homedir();
  // Replace home dir with $HOME so paths don't leak username / project names
  return text
    .split(home).join('$HOME')
    .replace(/\/Users\/[^/\s]+\//g, '$HOME/')
    .replace(/\/home\/[^/\s]+\//g, '$HOME/')
    .replace(/C:\\Users\\[^\\s]+\\/g, '%USERPROFILE%\\');
}

function writeCrashLog(err: unknown): void {
  try {
    const dir = path.join(os.homedir(), '.dirgha');
    fs.mkdirSync(dir, { recursive: true });
    const ts  = new Date().toISOString();
    const raw = err instanceof Error
      ? `${err.message}\n${err.stack ?? ''}`
      : String(err);
    const msg = sanitizeCrashLog(redactSecrets(raw));
    fs.appendFileSync(path.join(dir, 'crash.log'), `\n[${ts}]\n${msg}\n`, { mode: 0o600 });
  } catch { /* ignore secondary failure */ }
}

/**
 * Restore terminal state on any exit path. Ink's InputBox enables bracketed-
 * paste mode (ESC[?2004h) when it mounts; without this handler, a crash,
 * SIGINT, or unclean exit leaves the user's shell wrapping every paste with
 * literal ESC[200~...ESC[201~ markers — which mangles subsequent paste-of
 * passwords into shell history. Registered once at module load.
 */
function restoreTerminal() {
  try {
    process.stdout.write('\x1b[?2004l');     // disable bracketed paste
    process.stdout.write('\x1b[?1004l');     // disable XTerm focus events (defensive — heals crashed prior sessions)
    process.stdout.write('\x1b[?25h');       // show cursor
  } catch { /* best effort */ }
}
// Run once on startup too, in case a prior crashed session left focus-events
// (\x1b[?1004h) or bracketed-paste enabled — otherwise \x1b[I / \x1b[O bytes
// leak into this process's stdin and show up as `[O[I` in the input buffer.
try {
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[?1004l');
    process.stdout.write('\x1b[?2004l');
  }
} catch { /* best effort */ }
process.on('exit', restoreTerminal);
process.on('SIGINT', () => { restoreTerminal(); process.exit(130); });
process.on('SIGTERM', () => { restoreTerminal(); process.exit(143); });
process.on('SIGHUP', () => { restoreTerminal(); process.exit(129); });

process.on('uncaughtException', (err) => {
  restoreTerminal();
  writeCrashLog(err);
  console.error(chalk.red(`\n✗ Unexpected error: ${err instanceof Error ? err.message : String(err)}`));
  console.error(chalk.dim('  Details saved to ~/.dirgha/crash.log\n'));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  restoreTerminal();
  writeCrashLog(reason);
  console.error(chalk.red(`\n✗ Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`));
  console.error(chalk.dim('  Details saved to ~/.dirgha/crash.log\n'));
  process.exit(1);
});

import { checkUpdateIntegrity } from './utils/update-verify.js';
import { authCommand } from './commands/auth.js';
import { initCommand } from './commands/init.js';
import { accountStatusCommand } from './commands/status.js';
import { registerCheckpointCommand, registerRollbackCommand } from './commands/checkpoint.js';
import { registerSprintCommand, registerRunCommand } from './commands/sprint.js';
import { registerSandboxConnectCommand } from './commands/sandbox-connect.js';
import { loadKeysIntoEnv } from './utils/keys.js';
import { profiler } from './utils/startup-profiler.js';

profiler.begin('load-keys');
// Load persisted API keys at startup — must run before any provider detection
loadKeysIntoEnv();
profiler.end();

// ── Background version check — non-blocking, fire-and-forget ──────────────────
// .unref() so this background check doesn't keep the event loop alive after
// a short-lived subcommand (e.g. `dirgha status`) finishes printing. Without
// this, short commands hang for up to 5s waiting for the npm timeout and got
// reported as "stuck shells" when multiple were invoked in parallel.
setTimeout(() => {
  try {
    const raw = execCmd('npm', ['view', 'dirgha-cli', 'version', '--json'], { timeout: 5000 });
    const latest = raw.replace(/"/g, '').trim();
    if (latest && latest !== _cliVersion) {
      checkUpdateIntegrity()
        .then(({ integrityOk }) => {
          if (integrityOk) {
            _updateNudge = chalk.dim('  Update available: ') + chalk.cyan(latest) + chalk.dim(' → run ') + chalk.white('dirgha update') + '\n';
          } else {
            process.stderr.write(chalk.red('[dirgha] WARNING: Update integrity check failed — do not update until resolved\n'));
          }
        })
        .catch(() => { /* integrity fetch failed — show nudge anyway */
          _updateNudge = chalk.dim('  Update available: ') + chalk.cyan(latest) + chalk.dim(' → run ') + chalk.white('dirgha update') + '\n';
        });
    }
  } catch { /* offline or npm error — silently ignore */ }
}, 0).unref();

import { registerModelCommands } from './commands/models.js';
import { registerVoiceCommands } from './voice/commands.js';
import { chatCommand } from './commands/chat.js';
import { registerCurateCommand } from './commands/curate.js';
import { registerQueryCommand } from './commands/query.js';
import { registerSyncCommands } from './commands/sync.js';
import { registerProjectCommands } from './project-session/index.js';
import { registerUnifiedMemoryCommands } from './commands/unified-memory/index.js';
import { registerSwarmCommands } from './swarm/commands.js';
import { scanCommand } from './commands/scan/index.js';
import { mcpCommand } from './commands/mcp.js';
import { researchCommand } from './commands/research.js';
import { auditCommand } from './commands/audit.js';
import { statsCommand } from './commands/stats.js';
import { captureCommand, exportCommand } from './commands/capture.js';
import { doctorCommand } from './commands/doctor.js';
import { updateCommand } from './commands/update.js';
import { registerKnowledgeCommands } from './commands/knowledge.js';
import supportCommand from './commands/support.js';
import { registerMakeCommands } from './commands/make.js';
import { registerCompactCommand } from './commands/compact.js';
// Bucky / DAO / Mesh commands live in the separate @dirgha/bucky package.
// The CLI reaches them dynamically once bucky is installed — no static
// imports here so this build stays standalone.
import { registerAnalyticsCommands } from './commands/analytics.js';
import { registerBrowserIntegration } from './commands/browser-integration.js';
import { registerSmartExec } from './commands/smart-exec.js';

// ---------------------------------------------------------------------------
// Pre-parse: extract -e / --with-extension flags before routing
// ---------------------------------------------------------------------------

(function applyExtensionFlags() {
  const raw = process.argv.slice(2);
  const filtered: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '-e' || raw[i] === '--with-extension') {
      const json = raw[++i];
      if (!json) continue;
      try {
        const cfg = JSON.parse(json);
        import('./extensions/manager.js').then(({ addExtensionConfig }) => addExtensionConfig(cfg));
      } catch {
        console.error(chalk.yellow(`[extensions] Invalid JSON for --with-extension: ${json}`));
      }
    } else {
      filtered.push(raw[i]!);
    }
  }
  // Rebuild argv so commander sees the cleaned args
  process.argv = [process.argv[0]!, process.argv[1]!, ...filtered];
})();

// ---------------------------------------------------------------------------
// Entry: route to agent REPL or commander
// ---------------------------------------------------------------------------

const _args = process.argv.slice(2);
const SUBCOMMANDS = [
  'init', 'status', 'setup', 'auth', 'login', 'logout', 'chat', 'models', 'projects', 'session', 'run', 'keys',
  'mcp', 'scan', 'curate', 'sync', 'query', 'eval', 'stats', 'capture', 'export', 'doctor', 'update',
  'make', 'voice', 'voice-config', 'checkpoint', 'rollback', 'swarm', 'compact',
  // 'bucky', 'dao', 'mesh', 'join-mesh' — ship in @dirgha/bucky (separate package)
  'insights', 'project', 'browser', 'goto', 'extract', 'pdf', 'research', 'audit',
  'knowledge', 'k',       // Knowledge Engine (dirgha knowledge sync|wiki|search|viz)
  'recipe',               // recipe runner had the same fall-through bug
  'remember', 'recall',   // legacy memory aliases
  'hub',                  // CLI-Hub plugin registry (hub search|install|list|remove|info)
  'agent',                // Headless agent-mode dispatcher (dirgha agent chat ...)
  'contribute', 'support', // `dirgha contribute` (support is a legacy alias)
  '--help', '-h', '--version', '-V',
];

// Extract --resume / --session <id> before checking subcommands
let _resumeSessionId: string | undefined;
let _maxBudgetUsd: number | undefined;
let _headlessPrompt: string | undefined; // -p / --print — one-shot, no Ink
const _filteredArgs: string[] = [];
for (let i = 0; i < _args.length; i++) {
  if (_args[i] === '--resume') {
    if (_args[i + 1] && !_args[i + 1]!.startsWith('-')) {
      _resumeSessionId = _args[++i];
    } else {
      _resumeSessionId = '__last__';
    }
  } else if (_args[i] === '--session' && _args[i + 1]) {
    _resumeSessionId = _args[++i];
  } else if ((_args[i] === '--max-budget' || _args[i] === '--budget') && _args[i + 1]) {
    _maxBudgetUsd = parseFloat(_args[++i]!);
  } else if (_args[i] === '--debug') {
    process.env['DIRGHA_DEBUG'] = '1';
  } else if (_args[i] === '--profile') {
    process.env['DIRGHA_PROFILE'] = '1';
  } else if (_args[i] === '--dangerously-skip-permissions' || _args[i] === '--yolo') {
    process.env['DIRGHA_SKIP_PERMISSIONS'] = '1';
    process.env['DIRGHA_YOLO'] = '1';
  } else if ((_args[i] === '-p' || _args[i] === '--print') && _args[i + 1]) {
    _headlessPrompt = _args[++i];
  } else {
    _filteredArgs.push(_args[i]!);
  }
}
if (_resumeSessionId === '__last__') {
  _resumeSessionId = undefined;
}

const _firstArg = _filteredArgs[0] ?? '';
const _isSubcommand = SUBCOMMANDS.includes(_firstArg);

async function _runHeadless(prompt: string, resumeId: string | undefined): Promise<never> {
  try {
    const { runAgentLoop } = await import('./agent/loop.js');
    const { getDefaultModel } = await import('./agent/gateway.js');
    const model = process.env['DIRGHA_MODEL'] ?? getDefaultModel();
    const sessionId = resumeId ?? `headless_${Date.now()}`;
    await runAgentLoop(
      prompt,
      [],
      model,
      (t) => process.stdout.write(t),
      (name, input) => process.stderr.write(chalk.dim(`[tool] ${name} ${JSON.stringify(input).slice(0, 100)}\n`)),
      undefined,
      undefined,
      { sessionId, maxTurns: parseInt(process.env['DIRGHA_MAX_TURNS'] ?? '20', 10) || 20 },
    );
    process.stdout.write('\n');
    process.exit(0);
  } catch (e: any) {
    console.error(chalk.red(`\n✗ ${e instanceof Error ? e.message : String(e)}\n`));
    process.exit(1);
  }
}
const _headlessPromptFallback = (prompt: string, resumeId: string | undefined) => { void _runHeadless(prompt, resumeId); };

if (_headlessPrompt !== undefined) {
  // Explicit `-p` / `--print` flag — same code path as the no-TTY fallback.
  _headlessPromptFallback(_headlessPrompt, _resumeSessionId);
} else if (_filteredArgs.length === 0 || !_isSubcommand) {
  // Ink needs a real TTY for raw-mode input. When run under a pipe or
  // `</dev/null` (cron, tests, CI, SSH without -t) the TUI crashes with
  // "Raw mode is not supported", leaves the process wedged, and was the
  // source of the stuck-shell leaks we kept hitting. Detect the no-TTY case
  // up-front and give useful output instead of launching Ink.
  const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isTTY) {
    const prompt = _filteredArgs.length > 0 ? _filteredArgs.join(' ') : '';
    if (prompt) {
      // The user clearly wants the agent to do something but we have no
      // interactive input surface. Route to the same non-Ink path as `-p`.
      _headlessPromptFallback(prompt, _resumeSessionId);
    } else {
      // Truly empty invocation without a TTY — print usage and exit clean.
      process.stderr.write(
        'dirgha: no TTY detected. The interactive TUI requires a terminal.\n' +
        '  - To run a one-shot prompt:  dirgha -p "your prompt"\n' +
        '  - To see subcommands:        dirgha --help\n'
      );
      process.exit(0);
    }
  } else {
    // Normal interactive launch: print update nudge once if available.
    const _prompt = _filteredArgs.length > 0 ? _filteredArgs.join(' ') : undefined;
    if (_updateNudge) process.stdout.write(_updateNudge);
    import('./tui/index.js').then(m => m.startTUI(_prompt, _resumeSessionId, _maxBudgetUsd)).catch((e) => {
      console.error(chalk.red(`\n✗ ${e instanceof Error ? e.message : String(e)}\n`));
      process.exit(1);
    });
  }
} else {

// ---------------------------------------------------------------------------
// Commander subcommands (only reached when isSubcommand = true)
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('dirgha')
  .description('Dirgha Code — AI coding agent by dirgha.ai')
  .version(_cliVersion, '-V, --version')
  .hook('preAction', () => { if (_updateNudge) process.stdout.write(_updateNudge); });

program
  .command('login')
  .description('Authenticate with your Dirgha account')
  .option('--token <token>', 'Directly set auth token (headless / server use)')
  .option('--email <email>', 'Email to store with token (used with --token)')
  .option('--user-id <id>', 'User ID to store with token (used with --token)')
  .action(async (opts: { token?: string; email?: string; userId?: string }) => {
    const { loginCommand } = await import('./commands/login.js');
    await loginCommand();
  });

program
  .command('logout')
  .description('Clear saved credentials')
  .action(async () => {
    const { clearCredentials, isLoggedIn } = await import('./utils/credentials.js');
    if (!isLoggedIn()) {
      console.log(chalk.dim('\n  Not logged in.\n'));
      return;
    }
    clearCredentials();
    console.log(chalk.green('\n  ✓ Logged out. Credentials cleared.\n'));
  });

program
  .command('setup')
  .description('Interactive setup wizard for account, preferences, and platforms')
  .action(async () => {
    const { setupCommand } = await import('./commands/setup.js');
    await setupCommand();
  });

program
  .command('init')
  .description('Initialise project context in the current directory')
  .option('--force', 'Re-initialise even if already set up')
  .option('--verbose', 'Show key files after scan')
  .action(async (opts: { force?: boolean; verbose?: boolean }) => {
    await initCommand({ force: opts.force, verbose: opts.verbose });
  });

program
  .command('status')
  .description('Show account, quota, sessions, and project status')
  .action(async () => {
    await accountStatusCommand();
  });

program
  .command('auth')
  .description('Configure auth (legacy BYOK — use "dirgha login" for v2)')
  .action(async () => {
    await authCommand();
  });

program
  .command('keys')
  .description('Manage saved API keys (~/.dirgha/keys.json)')
  .argument('[action]', 'list | set <KEY> <value> | delete <KEY>', 'list')
  .argument('[key]', 'Key name (e.g. FIREWORKS_API_KEY)')
  .argument('[value]', 'Key value')
  .action(async (action: string, key: string | undefined, value: string | undefined) => {
    const { readKeys, setKey, deleteKey } = await import('./utils/keys.js');
    if (action === 'set' || (!action && key && value)) {
      const k = action === 'set' ? key! : action;
      const v = action === 'set' ? value! : key!;
      if (!k || !v) { console.error(chalk.red('Usage: dirgha keys set <KEY> <value>')); process.exit(1); }
      const { setKey: sk } = await import('./utils/keys.js');
      sk(k, v);
      process.env[k] = v;
      console.log(chalk.green(`✔ ${k} saved to ~/.dirgha/keys.json`));
    } else if (action === 'delete' && key) {
      deleteKey(key);
      console.log(chalk.green(`✔ ${key} removed`));
    } else {
      // list
      const keys = readKeys();
      const entries = Object.entries(keys);
      if (entries.length === 0) {
        console.log(chalk.dim('\n  No keys saved. Run: dirgha auth\n'));
        return;
      }
      console.log(chalk.bold('\n  Saved API keys (~/.dirgha/keys.json):\n'));
      for (const [k, v] of entries) {
        const masked = v.slice(0, 8) + '...' + v.slice(-4);
        const active = process.env[k] ? chalk.green(' ✓') : chalk.dim(' (not loaded)');
        console.log(`  ${chalk.cyan(k.padEnd(28))} ${chalk.dim(masked)}${active}`);
      }
      console.log();
    }
  });

program
  .command('chat')
  .description('Plain chat (no tools)')
  .option('-m, --model <model>', 'Override model')
  .action(async (opts: { model?: string }) => {
    await chatCommand({ model: opts.model });
  });

registerModelCommands(program);
registerCurateCommand(program);      // Legacy: use 'remember' instead
registerQueryCommand(program);       // Legacy: use 'recall' instead
registerSyncCommands(program);
registerProjectCommands(program);
registerUnifiedMemoryCommands(program);  // New: remember, recall, session-*, context
registerSwarmCommands(program);
registerVoiceCommands(program);
registerCheckpointCommand(program);
registerRollbackCommand(program);
registerSprintCommand(program);
registerRunCommand(program);
registerSandboxConnectCommand(program);
registerMakeCommands(program);
registerBrowserIntegration(program);  // Browser automation (navigate, click, type, snapshot, goto, extract, pdf)

program
  .command('projects')
  .description('Show recent projects')
  .action(async () => {
    const { listProjects } = await import('./utils/project-tracker.js');
    const entries = listProjects();
    if (entries.length === 0) {
      console.log(chalk.dim('\n  No recent projects.\n'));
      return;
    }
    console.log(chalk.bold('\nRecent projects:\n'));
    entries.forEach((e) => {
      const date = new Date(e.lastAccessed).toISOString().split('T')[0];
      const instr = e.lastInstruction.slice(0, 40).padEnd(40);
      console.log(`  ${chalk.cyan(e.dir.padEnd(32))}  ${chalk.dim(date)}  ${instr}`);
    });
    console.log();
  });

program.addCommand(scanCommand);
program.addCommand(mcpCommand);
program.addCommand(researchCommand);
program.addCommand(auditCommand);
registerKnowledgeCommands(program);
registerCompactCommand(program);
registerAnalyticsCommands(program);
registerSmartExec(program);

program
  .command('eval')
  .description('Run the built-in eval suite against the active provider')
  .option('-m, --model <model>', 'Override model for evals')
  .option('--ids <ids>', 'Comma-separated task IDs to run (default: all 20)')
  .option('--json', 'Output results as JSON')
  .action(async (opts: { model?: string; ids?: string; json?: boolean }) => {
    const { runEvals, TASK_SUITE } = await import('./evals/harness.js');
    const { getDefaultModel } = await import('./providers/detection.js');
    const model = opts.model ?? getDefaultModel();
    const tasks = opts.ids
      ? TASK_SUITE.filter(t => opts.ids!.split(',').map(s => s.trim()).includes(t.id))
      : TASK_SUITE;
    console.log(chalk.bold(`\nRunning ${tasks.length} eval tasks against ${chalk.cyan(model)}...\n`));
    const summary = await runEvals(tasks, model);
    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      const pct = ((summary.passed / tasks.length) * 100).toFixed(0);
      console.log(chalk.bold(`\nResults: ${summary.passed}/${tasks.length} passed (${pct}%) — avg score ${summary.avgScore.toFixed(2)} — ${summary.totalMs}ms`));
      for (const r of summary.results) {
        const icon = r.passed ? chalk.green('✓') : chalk.red('✗');
        const score = r.passed ? '' : chalk.red(` [${r.failReason}]`);
        console.log(`  ${icon} ${r.id.padEnd(20)} ${r.durationMs}ms${score}`);
      }
      console.log();
    }
  });

program
  .command('stats')
  .description('Show usage statistics (sessions, tokens, cost, tools)')
  .action(() => { statsCommand(); });

program.addCommand(captureCommand);
program.addCommand(exportCommand);
program.addCommand(doctorCommand);
program.addCommand(updateCommand);
supportCommand(program);

program
  .command('recipe')
  .description('Run a recipe file')
  .requiredOption('--recipe <path>', 'Path to a .yaml or .recipe.yaml recipe file')
  .option('--param <kv>', 'Pass a parameter as key=value (repeatable)', (v, acc: string[]) => [...acc, v], [] as string[])
  .action(async (opts: { recipe: string; param: string[] }) => {
    const { loadRecipeFromPath } = await import('./recipes/loader.js');
    const { runRecipe } = await import('./recipes/runner.js');
    const recipe = loadRecipeFromPath(opts.recipe);
    if (!recipe) {
      console.error(chalk.red(`Could not load recipe: ${opts.recipe}`));
      process.exit(1);
    }
    const params: Record<string, string> = {};
    for (const pair of opts.param) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx !== -1) params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
      else console.warn(chalk.yellow(`Ignoring invalid --param (expected key=value): ${pair}`));
    }
    const { getDefaultModel } = await import('./agent/gateway.js');
    const model = process.env['DIRGHA_MODEL'] ?? getDefaultModel();
    try {
      const { tokensUsed } = await runRecipe(
        recipe,
        params,
        model,
        (t) => process.stdout.write(t),
        (name) => console.error(chalk.dim(`[tool] ${name}`)),
      );
      console.log(chalk.dim(`\nTokens used: ${tokensUsed.toLocaleString()}`));
    } catch (e: any) {
      console.error(chalk.red(e.message ?? String(e)));
      process.exit(1);
    }
  });

// ── CLI-Hub plugin commands ──────────────────────────────────────────────────
const hubCmd = program
  .command('hub')
  .description('Plugin registry and management (CLI-Hub)');

hubCmd
  .command('search <query>')
  .description('Search for plugins')
  .option('-c, --category <cat>', 'Filter by category')
  .action(async (query, opts) => {
    const { hubSearch } = await import('./hub/commands.js');
    const result = await hubSearch(query, opts.category);
    console.log(result.text);
    process.exit(result.exitCode);
  });

hubCmd
  .command('install <name>')
  .description('Install a plugin')
  .option('-v, --version <ver>', 'Specific version')
  .option('-f, --force', 'Force reinstall')
  .action(async (name, opts) => {
    const { hubInstall } = await import('./hub/commands.js');
    const result = await hubInstall(name, opts);
    console.log(result.text);
    process.exit(result.exitCode);
  });

hubCmd
  .command('list')
  .description('List available or installed plugins')
  .option('-i, --installed', 'Show only installed plugins')
  .action(async (opts) => {
    const { hubList } = await import('./hub/commands.js');
    const result = await hubList(opts.installed);
    console.log(result.text);
    process.exit(result.exitCode);
  });

hubCmd
  .command('remove <name>')
  .description('Remove an installed plugin')
  .action(async (name) => {
    const { hubRemove } = await import('./hub/commands.js');
    const result = await hubRemove(name);
    console.log(result.text);
    process.exit(result.exitCode);
  });

hubCmd
  .command('info <name>')
  .description('Show plugin details')
  .action(async (name) => {
    const { hubInfo } = await import('./hub/commands.js');
    const result = await hubInfo(name);
    console.log(result.text);
    process.exit(result.exitCode);
  });

// Subcommands register action callbacks that may return a promise. Commander
// calls them then returns control here. Once all registered actions settle
// we force-exit — many action callbacks print their output then would stall
// for seconds waiting on long-lived timers (mesh heartbeats, bucky cron
// registrations, update-verify HTTPS fetch, etc.) that were created at
// module-load time and never meant to block exit. Short commands like
// `dirgha status` used to hang for ~10s because of this.
program.hook('postAction', async () => {
  // setImmediate so any .then() continuations queued by the action have a
  // chance to flush (e.g. final stdout writes).
  setImmediate(() => process.exit(process.exitCode ?? 0));
});
if (!_fastPathClaimed) {
  program.parseAsync(process.argv).catch((e) => {
    console.error(chalk.red(`\n✗ ${e instanceof Error ? e.message : String(e)}\n`));
    process.exit(1);
  });
}

} // end isSubcommand branch
