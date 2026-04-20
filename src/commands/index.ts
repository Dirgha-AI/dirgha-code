/**
 * commands/index.ts — CLI Command Registry
 * Project Bucky Sprint 13: CLI Polish
 * 
 * 40+ commands organized by category:
 * - Core: init, chat, status, doctor, help
 * - Knowledge: curate, query, remember, recall, compact
 * - Session: session, export, import, checkpoint, rollback, sync
 * - Quick: btw, yolo
 * - Agents: ensemble, swarm, bucky, agent-swarm
 * - Tools: browser, capture, connect, query-data, scratchpad, scan
 * - Mesh: mesh, join-mesh
 * - Setup: login, auth, setup, setup-local, local
 * - System: models, analytics, stats, mcp, voice-entry, dao, make, pay
 */

// Core commands
export { initCommand, statusCommand } from './init.js';
export { chatCommand } from './chat.js';
export { doctorCommand } from './doctor.js';

// Knowledge commands
export { registerCurateCommand } from './curate.js';
export { registerQueryCommand } from './query.js';
export { registerCompactCommand } from './compact.js';
export { registerSyncCommands } from './sync.js';

// Session commands
export { registerSessionCommands } from './session.js';
export { registerCheckpointCommand, registerRollbackCommand } from './checkpoint.js';
export { registerExportCommand } from './export-session.js';
export { registerImportCommand } from './import-session.js';

// Quick commands (Sprint 13)
export { registerBtwCommand } from './btw.js';
export { registerYoloCommand, isYoloEnabled } from './yolo.js';

// Agent commands (Sprint 13)
export { registerEnsembleCommand } from './ensemble.js';
export { swarmCommands } from './agent-swarm.js';
export { registerBuckyCommands } from './bucky.js';

// Tool commands (Sprint 13)
export { registerBrowserCommand } from './browser-cmd.js';
export { registerBrowserIntegration } from './browser-integration.js';
export { registerBrowserCommands } from '../browser/commands.js';
export { captureCommand, exportCommand } from './capture.js';
export { registerConnectCommand } from './connect.js';
export { registerDataQueryCommand } from './data-query.js';
export { registerScratchpadCommand, logExecution } from './scratchpad.js';
export { scanCommand } from './scan.js';
export { registerBugHunterCommand } from './bug-hunter.js';

// Mesh commands
export { registerMeshCommands } from './mesh.js';
export { registerJoinMeshCommand } from './join-mesh.js';

// Auth/Setup commands
export { loginCommand } from './login.js';
export { authCommand } from './auth.js';
export { setupCommand } from './setup.js';
export { handleSetupLocalCommand as setupLocalCommand } from './setup-local.js';
export { handleLocalCommand as localCommand } from './local.js';

// System commands
export { registerModelCommands } from './models.js';
export { registerAnalyticsCommands } from './analytics.js';
export { statsCommand } from './stats.js';
export { voiceCommand } from './voice-entry.js';
export { mcpCommand } from './mcp.js';
export { registerDAOCommands } from './dao.js';
export { registerMakeCommands } from './make.js';
export { payCommands } from './pay.js';
export { updateCommand } from './update.js';

// Unified memory commands
export { registerUnifiedMemoryCommands } from './unified-memory/index.js';

// Autocomplete & Progress (Sprint 13)
export { 
  registerAutocompleteCommand, 
  suggestCommands, 
  fuzzyMatch,
  suggestOnUnknown,
  COMMANDS 
} from './autocomplete.js';
export { 
  createSpinner, 
  progressBar, 
  multiStep,
  setTheme, 
  getTheme, 
  getThemeConfig,
  type Theme 
} from './progress.js';

// Legacy remember/recall (Quick commands)
export { registerRememberCmd } from './remember-cmd.js';
export { registerRecallCmd } from './recall-cmd.js';

// Account/Status
export { accountStatusCommand } from './status.js';
