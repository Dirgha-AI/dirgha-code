/**
 * agent/spawn/index.ts — Re-export all agent spawn functionality
 */
export type { Agent, CreateAgentOptions, SnapshotMeta } from './types.js';
export { 
  createAgent, destroyAgent, startAgent, stopAgent, connectAgent 
} from './lifecycle.js';
export { sendMessage, execOnAgent, getTranscript } from './messaging.js';
export { listAgents, cloneAgent, snapshotAgent } from './state.js';
export { 
  MNGR_DIR, checkTmux, checkSession, loadAgentConfig 
} from './utils.js';
