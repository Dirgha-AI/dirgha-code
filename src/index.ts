import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { execCmd } from './utils/safe-exec.js';
import { redactSecrets } from './agent/secrets.js';
export { redactSecrets };

// Build-injected version constant (replaced by esbuild define at build time)
declare const __CLI_VERSION__: string;
const _cliVersion = typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : '0.0.0';

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

process.on('uncaughtException', (err) => {
  writeCrashLog(err);
  console.error(chalk.red(`\n✗ Unexpected error: ${err instanceof Error ? err.message : String(err)}`));
  console.error(chalk.dim('  Details saved to ~/.dirgha/crash.log\n'));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
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

// ── Background version check — registered later, only for TUI mode ────────────
function _scheduleVersionCheck() {
  const t = setTimeout(() => {
    try {
      const raw = execCmd('npm', ['view', '@dirgha/code', 'version', '--json'], { timeout: 5000 });
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
          .catch(() => {
            _updateNudge = chalk.dim('  Update available: ') + chalk.cyan(latest) + chalk.dim(' → run ') + chalk.white('dirgha update') + '\n';
          });
      }
    } catch { /* offline or npm error — silently ignore */ }
  }, 0);
  t.unref();
}

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
import { registerBuckyCommands } from './commands/bucky.js';
import supportCommand from './commands/support.js';
import { registerDAOCommands } from './commands/dao.js';
import { registerMakeCommands } from './commands/make.js';
import { registerCompactCommand } from './commands/compact.js';
import { registerJoinMeshCommand } from './commands/join-mesh.js';
import { registerMeshCommands } from './commands/mesh/index.js';
import { registerAnalyticsCommands } from './commands/analytics.js';
import { registerBrowserIntegration } from './commands/browser-integration.js';
import { registerSmartExec } from './commands/smart-exec.js';
import { registerAskCommand } from './commands/ask.js';
import { registerHubCommands } from './hub/commands.js';
import { registerFleetCommands } from './fleet/commands.js';
import { installJsonCaptureIfEnabled } from './agent/output.js';

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
  'init', 'status', 'setup', 'auth', 'login', 'logout', 'signup', 'chat', 'models', 'projects', 'session', 'run', 'keys',
  'mcp', 'scan', 'curate', 'sync', 'query', 'eval', 'stats', 'capture', 'export', 'doctor', 'update',
  'dao', 'make', 'bucky', 'voice', 'voice-config', 'checkpoint', 'rollback', 'swarm', 'compact', 'mesh',
  'insights', 'project', 'browser', 'goto', 'extract', 'pdf', 'research', 'audit', 'recipe',
  // Unified memory commands (missing from list — caused them to route to TUI)
  'remember', 'recall', 'session-start', 'session-end', 'session-status', 'memory-stats', 'ctx', 'context',
  // Other missing commands
  'sprint', 'connect', 'jobs', 'bounties', 'coming-soon', 'smart-exec',
  // Headless agent mode
  'ask',
  // CLI-Hub plugin system
  'hub',
  // Parallel multi-agent
  'fleet',
  // Meta/tooling
  '__dump_spec', 'eval',
  '--help', '-h', '--version', '-V',
];

// Extract --resume / --session <id> before checking subcommands
let _resumeSessionId: string | undefined;
let _maxBudgetUsd: number | undefined;
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
  } else if (_args[i] === '--json') {
    // Global flag: strip from arg list, set env so any command can read it
    process.env['DIRGHA_JSON_OUTPUT'] = '1';
  } else {
    _filteredArgs.push(_args[i]!);
  }
}
if (_resumeSessionId === '__last__') {
  _resumeSessionId = undefined;
}

const _firstArg = _filteredArgs[0] ?? '';
const _isSubcommand = SUBCOMMANDS.includes(_firstArg);

if (_filteredArgs.length === 0 || !_isSubcommand) {
  // Launch Ink TUI — background version check only needed in interactive sessions
  _scheduleVersionCheck();
  const _prompt = _filteredArgs.length > 0 ? _filteredArgs.join(' ') : undefined;
  if (_updateNudge) process.stdout.write(_updateNudge);
  import('./tui/index.js').then(m => m.startTUI(_prompt, _resumeSessionId, _maxBudgetUsd)).catch((e) => {
    console.error(chalk.red(`\n✗ ${e instanceof Error ? e.message : String(e)}\n`));
    process.exit(1);
  });
} else {

// ---------------------------------------------------------------------------
// Commander subcommands (only reached when isSubcommand = true)
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('dirgha')
  .description('Dirgha Code — AI coding agent by dirgha.ai')
  .version(_cliVersion, '-V, --version')
  .option('--json', 'Emit machine-readable JSON output where supported (CLI-Anything compliance)')
  .hook('preAction', (thisCmd, actionCmd) => {
    if (_updateNudge) process.stdout.write(_updateNudge);
    const rootOpts = thisCmd.optsWithGlobals?.() ?? thisCmd.opts();
    if (rootOpts.json) process.env['DIRGHA_JSON_OUTPUT'] = '1';
    // Universal --json wrapper: works for every command, even those that
    // don't use the emit() helper. Commands that emit natively can skip
    // by setting globalThis.__DIRGHA_JSON_NATIVELY_EMITTED__ = true.
    installJsonCaptureIfEnabled(actionCmd.name());
  });

program
  .command('login')
  .description('Sign in to Dirgha (device flow) or set a token (--token)')
  .option('--token <token>', 'Use an API token from dirgha.ai/dashboard (headless)')
  .option('--email <email>', 'Email to save with the token')
  .option('--user-id <id>', 'User ID to save with the token')
  .option('--browser', 'Auto-open the sign-in URL in your default browser')
  .action(async (opts: { token?: string; email?: string; userId?: string; browser?: boolean }) => {
    const { loginCommand } = await import('./commands/login.js');
    await loginCommand(opts);
  });

program
  .command('signup')
  .description('Create a new Dirgha account (opens browser)')
  .action(async () => {
    const { registerLoginCommand } = await import('./commands/login.js');
    // registerLoginCommand also wires `signup`; run it via a throwaway commander.
    const { Command } = await import('commander');
    const p = new Command();
    registerLoginCommand(p);
    const sub = p.commands.find((c: any) => c.name() === 'signup');
    if (sub) await (sub as any)._actionHandler([{}, p]);
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
registerDAOCommands(program);
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
registerBuckyCommands(program);
registerJoinMeshCommand(program);
registerCompactCommand(program);
registerMeshCommands(program);
registerAnalyticsCommands(program);
registerSmartExec(program);
registerAskCommand(program);
registerHubCommands(program);
registerFleetCommands(program);

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
      process.exit(0);
    } catch (e: any) {
      console.error(chalk.red(e.message ?? String(e)));
      process.exit(1);
    }
  });

// __dump_spec — introspect commander tree for auto-SKILL.md generation
if (_filteredArgs[0] === '__dump_spec') {
  const walk = (c: any): any => ({
    name: c.name(),
    description: c.description(),
    args: (c.registeredArguments ?? []).map((a: any) => ({
      name: a.name(),
      required: a.required,
      type: 'string',
    })),
    flags: (c.options ?? []).map((o: any) => ({
      name: o.long?.replace(/^--/, '') ?? o.short?.replace(/^-/, ''),
      short: o.short?.replace(/^-/, ''),
      type: o.flags.includes('<') ? 'string' : o.flags.includes('[') ? 'string' : 'boolean',
      description: o.description,
    })),
    subcommands: (c.commands ?? []).map(walk),
  });
  const spec = {
    name: 'dirgha',
    version: _cliVersion,
    description: program.description(),
    commands: program.commands.map(walk),
  };
  process.stdout.write(JSON.stringify(spec, null, 2));
  process.exit(0);
}

program.parse(process.argv);

} // end isSubcommand branch
