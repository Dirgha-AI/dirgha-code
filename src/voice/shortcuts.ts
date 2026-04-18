/**
 * voice/shortcuts.ts — Global keyboard shortcuts
 */
import { EventEmitter } from 'events';

export interface ShortcutConfig {
  toggleRecording: string;
  wakePlex: string;
  cancel: string;
}

const DEFAULT_SHORTCUTS: ShortcutConfig = {
  toggleRecording: 'Ctrl+Shift+V',
  wakePlex: 'Ctrl+Shift+Space',
  cancel: 'Escape'
};

export class ShortcutManager extends EventEmitter {
  private shortcuts: ShortcutConfig;

  constructor(shortcuts: Partial<ShortcutConfig> = {}) {
    super();
    this.shortcuts = { ...DEFAULT_SHORTCUTS, ...shortcuts };
  }

  register(): void {
    // In real implementation: use node-global-keyboard-listener or electron
    console.log(`[SHORTCUTS] Registered:`);
    console.log(`  ${this.shortcuts.toggleRecording} - Toggle recording`);
    console.log(`  ${this.shortcuts.wakePlex} - Wake Personal Plex`);
    console.log(`  ${this.shortcuts.cancel} - Cancel`);
    
    this.emit('ready');
  }

  unregister(): void {
    this.emit('unregistered');
  }

  getShortcuts(): ShortcutConfig {
    return { ...this.shortcuts };
  }
}
