import * as vscode from 'vscode';
import { spawn } from 'node:child_process';

/**
 * Dirgha Code VS Code extension — shells to the local @dirgha/code CLI.
 * We intentionally do NOT re-implement the agent here; anything the CLI
 * gains (new tools, new providers, sandbox guarantees) is immediately
 * available through this extension with no plugin update.
 */

let output: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!output) output = vscode.window.createOutputChannel('Dirgha');
  return output;
}

function cfg<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration('dirgha').get<T>(key, fallback);
}

function runInTerminal(args: string[]): void {
  const binary = cfg<string>('binaryPath', 'dirgha');
  const term = vscode.window.createTerminal({ name: 'Dirgha', env: terminalEnv() });
  term.show(true);
  term.sendText(`${binary} ${args.map(quote).join(' ')}`);
}

function runInPanel(args: string[], headerText?: string): void {
  const ch = getChannel();
  ch.show(true);
  if (headerText) {
    ch.appendLine(`\n── ${headerText} ──`);
  }
  const binary = cfg<string>('binaryPath', 'dirgha');
  const proc = spawn(binary, args, {
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
    env: { ...process.env, ...terminalEnv() },
  });
  proc.stdout.on('data', (d) => ch.append(d.toString()));
  proc.stderr.on('data', (d) => ch.append(d.toString()));
  proc.on('error', (err) => {
    ch.appendLine(`\n[error] ${err.message}`);
    ch.appendLine(`        Is \`${binary}\` on your PATH? Try: npm install -g @dirgha/code`);
  });
  proc.on('close', (code) => {
    ch.appendLine(`\n[exit ${code ?? 0}]`);
  });
}

function terminalEnv(): Record<string, string> {
  const model = cfg<string>('defaultModel', '');
  const env: Record<string, string> = {};
  if (model) env.DIRGHA_CODE_MODEL = model;
  return env;
}

function quote(s: string): string {
  // Shell-quote only when needed — mirrors how the integrated terminal
  // expects tokens. Safe because we never concatenate user strings into
  // shell; we pass them as argv via spawn() or sendText tokens.
  if (/^[\w./:@=-]+$/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

function showMethod(): 'panel' | 'terminal' {
  return cfg<'panel' | 'terminal'>('showOutput', 'panel');
}

async function run(args: string[], header?: string): Promise<void> {
  if (showMethod() === 'terminal') runInTerminal(args);
  else runInPanel(args, header);
}

async function askAboutFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open a file first.');
    return;
  }
  const prompt = await vscode.window.showInputBox({
    prompt: 'Ask Dirgha about this file',
    placeHolder: 'e.g., explain this file / find bugs / add tests',
  });
  if (!prompt) return;
  const path = vscode.workspace.asRelativePath(editor.document.uri);
  await run(['ask', `${prompt}\n\nContext: read_file("${path}")`], `ask: ${prompt}`);
}

async function askAboutSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Make a selection first.');
    return;
  }
  const selection = editor.document.getText(editor.selection);
  if (!selection.trim()) {
    vscode.window.showWarningMessage('Empty selection.');
    return;
  }
  const prompt = await vscode.window.showInputBox({
    prompt: 'Ask Dirgha about this selection',
    placeHolder: 'e.g., refactor / explain / write tests for this',
  });
  if (!prompt) return;
  await run(['ask', `${prompt}\n\nSelection:\n\`\`\`\n${selection}\n\`\`\``], `ask: ${prompt}`);
}

function openRepl(): void {
  runInTerminal([]);
}

function showStatus(): void {
  run(['status'], 'status');
}

export function activate(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('dirgha.ask', askAboutFile),
    vscode.commands.registerCommand('dirgha.askSelection', askAboutSelection),
    vscode.commands.registerCommand('dirgha.openRepl', openRepl),
    vscode.commands.registerCommand('dirgha.status', showStatus),
  );

  // Tiny status bar item so the extension is discoverable.
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  bar.text = '$(sparkle) Dirgha';
  bar.tooltip = 'Dirgha: Ask about current file';
  bar.command = 'dirgha.ask';
  bar.show();
  ctx.subscriptions.push(bar);
}

export function deactivate(): void {
  output?.dispose();
}
