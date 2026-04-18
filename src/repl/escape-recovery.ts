/**
 * Recoverable Escape Handler for Dirgha CLI REPL
 * 
 * Enhances ESC key to:
 * 1. Save session checkpoint
 * 2. Show recovery options
 * 3. Allow resuming without losing context
 * 
 * Unlike process.exit(), this preserves the session.
 */

import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Message } from '../types.js';

const SESSIONS_DIR = join(homedir(), '.dirgha', 'sessions');

interface SessionCheckpoint {
  id: string;
  timestamp: string;
  messages: Message[];
  model: string;
  cwd: string;
  tokensUsed: number;
}

interface RecoveryOptions {
  /** Save checkpoint before showing menu */
  saveCheckpoint: (messages: Message[], model: string, tokens: number) => string;
  /** Resume from checkpoint ID */
  resumeCheckpoint: (id: string) => SessionCheckpoint | null;
  /** Continue without checkpoint */
  onContinue: () => void;
  /** Save and exit */
  onSaveAndExit: () => void;
  /** Exit without saving */
  onExit: () => void;
}

let isEscapePressed = false;
let currentCheckpointId: string | null = null;
let checkpointCounter = 0;

/**
 * Save session checkpoint to disk
 */
export function saveCheckpoint(
  messages: Message[],
  model: string,
  tokensUsed: number,
  cwd: string = process.cwd()
): string {
  // Ensure sessions directory exists
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  const checkpoint: SessionCheckpoint = {
    id: `session-${Date.now()}-${++checkpointCounter}`,
    timestamp: new Date().toISOString(),
    messages: [...messages], // Clone to avoid reference issues
    model,
    cwd,
    tokensUsed,
  };

  const filePath = join(SESSIONS_DIR, `${checkpoint.id}.json`);
  writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
  currentCheckpointId = checkpoint.id;

  return checkpoint.id;
}

/**
 * Load checkpoint by ID
 */
export function loadCheckpoint(id: string): SessionCheckpoint | null {
  try {
    const filePath = join(SESSIONS_DIR, `${id}.json`);
    if (!existsSync(filePath)) return null;
    
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return data as SessionCheckpoint;
  } catch {
    return null;
  }
}

/**
 * List all saved checkpoints
 */
export function listCheckpoints(): SessionCheckpoint[] {
  if (!existsSync(SESSIONS_DIR)) return [];
  
  try {
    const files = readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(readFileSync(join(SESSIONS_DIR, f), 'utf-8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        if (timeDiff !== 0) return timeDiff;
        // Tiebreak by counter suffix in id (session-<ts>-<counter>)
        const counterA = parseInt(a.id.split('-').pop() ?? '0', 10);
        const counterB = parseInt(b.id.split('-').pop() ?? '0', 10);
        return counterB - counterA;
      });
    
    return files.slice(0, 10); // Last 10 sessions
  } catch {
    return [];
  }
}

/**
 * Delete checkpoint
 */
export function deleteCheckpoint(id: string): boolean {
  try {
    const filePath = join(SESSIONS_DIR, `${id}.json`);
    if (existsSync(filePath)) {
      const { unlinkSync } = require('fs');
      unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Show recovery menu after ESC pressed
 * 
 * CRITICAL: This function does NOT use raw mode to avoid breaking readline.
 * Raw mode (setRawMode(true)) causes the Enter key to stop working afterward
 * because it doesn't properly restore the readline interface.
 * 
 * Instead, we use a simple line-by-line readline interface in cooked mode.
 */
export async function showRecoveryMenu(
  checkpointId: string,
  messages: Message[],
  model: string,
  tokens: number
): Promise<'resume' | 'continue' | 'save-exit' | 'exit'> {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────┐'));
  console.log(chalk.cyan('│  ⏸  Session paused — checkpoint saved  │'));
  console.log(chalk.cyan('│                                         │'));
  console.log(chalk.gray(`│  ID: ${checkpointId.slice(0, 20)}...        │`));
  console.log(chalk.gray(`│  Messages: ${messages.length}  |  Tokens: ${tokens}          │`));
  console.log(chalk.cyan('│                                         │'));
  console.log(chalk.cyan('│  [Enter] Resume from checkpoint         │'));
  console.log(chalk.cyan('│  [C] Continue without checkpoint        │'));
  console.log(chalk.cyan('│  [S] Save and exit                      │'));
  console.log(chalk.cyan('│  [X] Exit without saving                │'));
  console.log(chalk.cyan('│                                         │'));
  console.log(chalk.dim('│  Auto-resuming in 10 seconds...         │'));
  console.log(chalk.cyan('└─────────────────────────────────────────┘\n'));

  // Use readline in cooked mode (NOT raw mode) to avoid breaking stdin
  const readline = await import('readline');
  
  return new Promise((resolve) => {
    // Create a temporary readline interface for this prompt only
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    const timer = setTimeout(() => {
      rl.close();
      resolve('resume'); // Auto-resume after 10s
    }, 10000);

    rl.question(chalk.dim('Choice [Enter/C/S/X]: '), (answer: string) => {
      clearTimeout(timer);
      rl.close();
      
      const choice = answer.trim().toLowerCase();
      
      if (choice === '' || choice === 'r') {
        resolve('resume');
      } else if (choice === 'c') {
        resolve('continue');
      } else if (choice === 's') {
        resolve('save-exit');
      } else if (choice === 'x') {
        resolve('exit');
      } else {
        // Invalid choice - default to resume
        console.log(chalk.dim('  Invalid choice, resuming...'));
        resolve('resume');
      }
    });
  });
}

/**
 * Enhanced ESC handler that saves checkpoint and shows menu
 */
export function createRecoverableEscapeHandler(
  messages: Message[],
  model: string,
  tokens: number,
  onResume: (checkpoint: SessionCheckpoint) => void,
  onContinue: () => void,
  onSaveAndExit: () => void,
  onExit: () => void
): (str: string, key: { name?: string }) => Promise<void> {
  return async (_str: string, key: { name?: string }) => {
    if (key?.name !== 'escape' || isEscapePressed) {
      return;
    }

    isEscapePressed = true;

    // Save checkpoint
    console.log(chalk.yellow('\n⚠ ESC pressed — saving checkpoint...'));
    const checkpointId = saveCheckpoint(messages, model, tokens);
    
    // Show recovery menu
    const choice = await showRecoveryMenu(checkpointId, messages, model, tokens);
    
    switch (choice) {
      case 'resume': {
        const checkpoint = loadCheckpoint(checkpointId);
        if (checkpoint) {
          console.log(chalk.green('\n▶ Resuming from checkpoint...\n'));
          onResume(checkpoint);
        }
        break;
      }
      case 'continue':
        console.log(chalk.dim('\n▶ Continuing without checkpoint\n'));
        onContinue();
        break;
      case 'save-exit':
        console.log(chalk.green('\n✓ Session saved. Exiting...'));
        onSaveAndExit();
        break;
      case 'exit':
        console.log(chalk.red('\n→ Exiting without saving'));
        deleteCheckpoint(checkpointId); // Clean up
        onExit();
        break;
    }

    isEscapePressed = false;
  };
}

/**
 * Reset escape state (call when resuming)
 */
export function resetEscapeState(): void {
  isEscapePressed = false;
  currentCheckpointId = null;
  checkpointCounter = 0;
}

/**
 * Check if escape was recently pressed
 */
export function wasEscapePressed(): boolean {
  return isEscapePressed;
}

/**
 * Get current checkpoint ID
 */
export function getCurrentCheckpointId(): string | null {
  return currentCheckpointId;
}

export default {
  saveCheckpoint,
  loadCheckpoint,
  listCheckpoints,
  deleteCheckpoint,
  showRecoveryMenu,
  createRecoverableEscapeHandler,
  resetEscapeState,
  wasEscapePressed,
  getCurrentCheckpointId,
};
