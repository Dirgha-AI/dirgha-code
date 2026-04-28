"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('dirgha.askInline', askInline), vscode.commands.registerCommand('dirgha.openTerminal', openTerminal));
}
function deactivate() {
    // no-op
}
async function askInline() {
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
    const composed = selectionText.length > 0
        ? `${prompt}\n\n--- selected code ---\n${selectionText}`
        : prompt;
    let output;
    try {
        output = await runDirgha(['ask', '--print', composed], editor.document.uri);
    }
    catch (err) {
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
        }
        else {
            edit.replace(selectionRange, output);
        }
    });
}
function openTerminal() {
    const term = vscode.window.createTerminal({ name: 'Dirgha' });
    term.show(true);
    term.sendText('dirgha', true);
}
function runDirgha(args, scopeUri) {
    return new Promise((resolve, reject) => {
        const cwd = workspaceCwd(scopeUri);
        let child;
        try {
            child = (0, child_process_1.spawn)('dirgha', args, {
                cwd,
                env: process.env,
                shell: false,
            });
        }
        catch (err) {
            reject(new Error(`failed to spawn 'dirgha' (${err instanceof Error ? err.message : String(err)}). Is the CLI installed and on PATH?`));
            return;
        }
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });
        child.on('error', (err) => {
            if (err.code === 'ENOENT') {
                reject(new Error("'dirgha' binary not found on PATH."));
            }
            else {
                reject(err);
            }
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            }
            else {
                const tail = (stderr || stdout).trim().split('\n').slice(-5).join('\n');
                reject(new Error(`dirgha exited ${code ?? 'null'}: ${tail}`));
            }
        });
    });
}
function workspaceCwd(scopeUri) {
    if (scopeUri) {
        const folder = vscode.workspace.getWorkspaceFolder(scopeUri);
        if (folder) {
            return folder.uri.fsPath;
        }
    }
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}
//# sourceMappingURL=extension.js.map