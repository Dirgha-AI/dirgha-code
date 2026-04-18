/**
 * Unified Memory Commands - Barrel exports
 * 
 * 5-layer memory system with session isolation
 */

export { registerRememberCommand } from './remember.js';
export { registerRecallCommand } from './recall.js';
export { registerSessionCommands } from './session.js';
export { registerMemoryStatsCommand } from './stats.js';
export { registerContextCommand } from './context.js';

import { Command } from 'commander';
import { registerRememberCommand } from './remember.js';
import { registerRecallCommand } from './recall.js';
import { registerSessionCommands } from './session.js';
import { registerMemoryStatsCommand } from './stats.js';
import { registerContextCommand } from './context.js';

export function registerUnifiedMemoryCommands(program: Command): void {
  registerRememberCommand(program);
  registerRecallCommand(program);
  registerSessionCommands(program);
  registerMemoryStatsCommand(program);
  registerContextCommand(program);
}
