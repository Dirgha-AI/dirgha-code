import * as vscode from 'vscode';
import { spawn } from 'child_process';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('dirgha.askInline', askInline),
    vscode.commands.registerCommand('dirgha.openTerminal', openTerminal),
  );
}

export function deactivate(): void {
  // no-op
}

async function askInline(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('Dirgha: open a file first.');
    return;
  }

  const prompt = await vscode.window.showInputBox({
    prompt: 'Ask Dirgha',
    placeHolder: 'e.g. refactor this to use async/await',
    ignoreFocusOut: true,
  });
  if (!prompt) {
    return;
  }

  const selectionRange = editor.selection;
  const selectionText = editor.document.getText(selectionRange);

  const composed =
    selectionText.length > 0
      ? `${prompt}\n\n--- selected code ---\n${selectionText}`
      : prompt;

  let output: string;
  try {
    output = await runDirgha(['ask', '--print', composed], editor.document.uri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Dirgha: ${msg}`);
    return;
  }

  if (!output.trim()) {
    vscode.window.showWarningMessage('Dirgha: empty response.');
    return;
  }

  await editor.edit((edit) => {
    if (selectionRange.isEmpty) {
      edit.insert(selectionRange.active, output);
    } else {
      edit.replace(selectionRange, output);
    }
  });
}

function openTerminal(): void {
  const term = vscode.window.createTerminal({ name: 'Dirgha' });
  term.show(true);
  term.sendText('dirgha', true);
}

function runDirgha(args: string[], scopeUri?: vscode.Uri): Promise<string> {
  return new Promise((resolve, reject) => {
    const cwd = workspaceCwd(scopeUri);
    let child;
    try {
      child = spawn('dirgha', args, {
        cwd,
        env: process.env,
        shell: false,
      });
    } catch (err) {
      reject(
        new Error(
          `failed to spawn 'dirgha' (${
            err instanceof Error ? err.message : String(err)
          }). Is the CLI installed and on PATH?`,
        ),
      );
      return;
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error("'dirgha' binary not found on PATH."));
      } else {
        reject(err);
      }
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        const tail = (stderr || stdout).trim().split('\n').slice(-5).join('\n');
        reject(new Error(`dirgha exited ${code ?? 'null'}: ${tail}`));
      }
    });
  });
}

function workspaceCwd(scopeUri?: vscode.Uri): string | undefined {
  if (scopeUri) {
    const folder = vscode.workspace.getWorkspaceFolder(scopeUri);
    if (folder) {
      return folder.uri.fsPath;
    }
  }
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}
