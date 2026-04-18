/**
 * swarm/index.ts — Public API exports
 */
export * from './types.js';
export { AdaptiveModelRouter, AgentPool } from './runtime/ModelPool.js';
export { CRDTDocumentImpl, CRDTFactory } from './collaboration/CRDT.js';
export { AgentGit } from './collaboration/AgentGit.js';
export { WorkerAgent, WorkerSwarm } from './agents/WorkerAgent.js';
export { VerificationQuorum, SecurityVerifier } from './agents/VerificationQuorum.js';
export { ColonyManager } from './orchestration/ColonyManager.js';
export { CostOptimizer, BudgetEnforcer } from './governance/CostOptimizer.js';
export { MicroTestRunner } from './testing/MicroTestFramework.js';
export { MacroTestRunner } from './testing/MacroTestFramework.js';
export { SALESFORCE_DOMAINS, generateProjectPlan } from './templates/SalesforceDomains.js';
export { registerSwarmCommands } from './commands.js';
