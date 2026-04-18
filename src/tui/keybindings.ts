/**
 * tui/keybindings.ts — User-configurable key bindings
 *
 * Loaded from ~/.dirgha/keybindings.json at startup.
 * Components call kb('action') to get the current binding.
 *
 * Example ~/.dirgha/keybindings.json:
 * {
 *   "submit": "enter",
 *   "scrollUp": "ctrl+u",
 *   "historySearch": "ctrl+r",
 *   "sessionPicker": "ctrl+s",
 *   "cancel": "escape",
 *   "modelPicker": "m",
 *   "keysPicker": "k"
 * }
 */
import os from 'os';
import fs from 'fs';
import path from 'path';

export type KeyAction =
  | 'submit' | 'cancel' | 'scrollUp' | 'scrollDown'
  | 'historySearch' | 'sessionPicker' | 'openEditor'
  | 'modelPicker';

type Binding = { ctrl?: boolean; key: string };

const DEFAULTS: Record<KeyAction, Binding> = {
  submit:        { key: 'return' },
  cancel:        { key: 'escape' },
  scrollUp:      { ctrl: true, key: 'u' },
  scrollDown:    { ctrl: true, key: 'd' },
  historySearch: { ctrl: true, key: 'r' },
  sessionPicker: { ctrl: true, key: 's' },
  openEditor:    { ctrl: true, key: 'e' },  // after Ctrl+X arm
  modelPicker:   { key: 'm' },
};

let _bindings: Record<KeyAction, Binding> = { ...DEFAULTS };

function kbPath(): string {
  return path.join(os.homedir(), '.dirgha', 'keybindings.json');
}

function loadKeybindings(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(kbPath(), 'utf8')) as Record<string, string>;
    for (const [action, binding] of Object.entries(raw)) {
      if (!(action in DEFAULTS)) continue;
      const parts = binding.toLowerCase().split('+');
      const ctrl  = parts.includes('ctrl');
      const key   = parts[parts.length - 1] ?? '';
      if (key) (_bindings as any)[action] = { ctrl, key };
    }
  } catch { /* use defaults */ }
}
loadKeybindings();

/** Check if a key event matches the binding for an action */
export function kb(action: KeyAction, ch: string, key: { ctrl?: boolean; [k: string]: unknown }): boolean {
  const b = _bindings[action];
  if (!b) return false;
  const ctrlMatch = !b.ctrl || key.ctrl;
  const keyMatch  = ch === b.key || (key as any)[b.key] === true;
  return !!(ctrlMatch && keyMatch);
}

/** Return a human-readable label for a binding (for UI hints) */
export function kbLabel(action: KeyAction): string {
  const b = _bindings[action];
  if (!b) return '';
  const mod  = b.ctrl ? 'Ctrl+' : '';
  const name = b.key === 'return' ? 'Enter' : b.key === 'escape' ? 'Esc' : b.key.toUpperCase();
  return `${mod}${name}`;
}

/** Save a single keybinding to config */
export function setKeybinding(action: KeyAction, binding: string): boolean {
  if (!(action in DEFAULTS)) return false;
  const parts = binding.toLowerCase().split('+');
  const ctrl  = parts.includes('ctrl');
  const key   = parts[parts.length - 1] ?? '';
  if (!key) return false;
  (_bindings as any)[action] = { ctrl, key };
  try {
    fs.mkdirSync(path.dirname(kbPath()), { recursive: true });
    let cfg: Record<string, string> = {};
    try { cfg = JSON.parse(fs.readFileSync(kbPath(), 'utf8')); } catch { /* fresh */ }
    cfg[action] = binding;
    fs.writeFileSync(kbPath(), JSON.stringify(cfg, null, 2), 'utf8');
  } catch { return false; }
  return true;
}
