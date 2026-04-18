/**
 * swarm/types.ts — Core types for multi-agent swarm architecture
 */

// L1: Execution Runtime Types
export interface AgentID extends String {
  readonly _brand: unique symbol;
}

export interface TaskID extends String {
  readonly _brand: unique symbol;
}

export interface SessionID extends String {
  readonly _brand: unique symbol;
}

export interface Agent {
  id: AgentID;
  name: string;
  role: AgentRole;
  model: string;
  systemPrompt: string;
  capabilities: AgentCapability[];
  costTier: 'premium' | 'standard' | 'economy' | 'local';
  status: 'idle' | 'busy' | 'error' | 'offline';
  currentTask?: TaskID;
  stats: AgentStats;
}

export type AgentRole = 
  | 'api' | 'db' | 'ui' | 'auth' | 'test' | 'doc' | 'devops' | 'integration' | 'qa'
  | 'consensus' | 'proof' | 'security' | 'performance' | 'compatibility'
  | 'domain-lead' | 'merge-master' | 'scheduler' | 'quality-gate';

export type AgentCapability = 
  | 'code-generation' | 'code-review' | 'testing' | 'documentation'
  | 'security-scan' | 'performance-analysis' | 'type-checking' | 'linting'
  | 'architecture' | 'integration' | 'verification' | 'coordination';

export interface AgentStats {
  tasksCompleted: number;
  tasksFailed: number;
  averageTaskDuration: number;
  totalCost: number;
  lastActive: string;
}

// L2: Collaboration Fabric Types
export interface CRDTDocument {
  id: string;
  content: CRDTNode[];
  version: VectorClock;
  agents: Set<AgentID>;
}

export interface CRDTNode {
  id: string;
  char: string;
  agentId: AgentID;
  timestamp: number;
  deleted: boolean;
}

export interface VectorClock {
  [agentId: string]: number;
}

export interface Operation {
  id: string;
  type: 'insert' | 'delete' | 'move' | 'rename' | 'batch';
  path: string;
  range: { start: number; end: number };
  content?: string;
  newPath?: string;
  agentId: AgentID;
  timestamp: number;
  dependencies: string[];
  documentId: string;
}

export interface AgentCommit {
  id: string;
  agentId: AgentID;
  sessionId: SessionID;
  parentIds: string[];
  timestamp: number;
  operations: Operation[];
  metadata: CommitMetadata;
}

export interface CommitMetadata {
  filesChanged: string[];
  linesAdded: number;
  linesDeleted: number;
  testResults: TestResult[];
  verificationStatus: VerificationStatus;
  cost: number;
  duration: number;
}

// L3: Task & Domain Types
export interface Task {
  id: TaskID;
  type: TaskType;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  domain: Domain;
  complexity: number; // 0-1
  critical: boolean;
  securityCritical: boolean;
  estimatedCost: number;
  estimatedDuration: number;
  dependencies: TaskID[];
  status: TaskStatus;
  assignedTo?: AgentID;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  verification?: VerificationResult;
}

export type TaskType = 
  | 'feature' | 'bugfix' | 'refactor' | 'test' | 'doc' 
  | 'integration' | 'optimization' | 'security' | 'verification';

export type Domain = 
  | 'platform' | 'sales-cloud' | 'service-cloud' | 'marketing-cloud' 
  | 'commerce-cloud' | 'app-exchange' | 'integration' | 'shared';

export type TaskStatus = 
  | 'pending' | 'queued' | 'assigned' | 'in-progress' 
  | 'verifying' | 'completed' | 'failed' | 'blocked';

// L4: Orchestration Types
export interface DependencyGraph {
  nodes: Map<TaskID, Task>;
  edges: Map<TaskID, TaskID[]>; // Task → Depends on
}

export interface Colony {
  id: string;
  name: string;
  domains: Domain[];
  agents: Map<AgentID, Agent>;
  tasks: Map<TaskID, Task>;
  workspace: CollaborativeWorkspace;
  budget: Budget;
  metrics: ColonyMetrics;
}

export interface CollaborativeWorkspace {
  documents: Map<string, CRDTDocument>;
  transforms: OperationTransformQueue;
  presence: Map<AgentID, CursorPosition>;
  commits: AgentCommit[];
}

export interface CursorPosition {
  documentId: string;
  line: number;
  column: number;
  selection?: { start: number; end: number };
}

export interface OperationTransformQueue {
  pending: Operation[];
  applied: Operation[];
  transform(opA: Operation, opB: Operation): [Operation, Operation];
}

export interface Budget {
  total: number;
  spent: number;
  remaining: number;
  dailyLimit: number;
  emergencyReserve: number;
}

export interface ColonyMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeAgents: number;
  averageTaskDuration: number;
  costPerTask: number;
  qualityScore: number;
  mergeConflictRate: number;
}

// L5: Governance & Verification Types
export interface VerificationResult {
  approved: boolean;
  consensus: number; // 0-1
  quorum: number;
  votes: ModelVote[];
  issues: VerificationIssue[];
  cost: number;
  duration: number;
}

export interface ModelVote {
  model: string;
  tier: 'premium' | 'standard' | 'economy' | 'local';
  approve: boolean;
  confidence: number;
  reasoning: string;
  issues: string[];
}

export interface VerificationIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: 'type-error' | 'security' | 'logic' | 'style' | 'performance';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface TestResult {
  type: 'unit' | 'integration' | 'e2e' | 'property' | 'mutation';
  passed: boolean;
  coverage: number;
  duration: number;
  tests: { name: string; passed: boolean; duration: number }[];
}

export interface VerificationStatus {
  status: 'pending' | 'in-progress' | 'passed' | 'failed';
  approvals: number;
  rejections: number;
  required: number;
}

// Cost Optimization Types
export interface ModelTier {
  name: 'premium' | 'standard' | 'economy' | 'local';
  models: string[];
  costPer1KTokens: number;
  quality: number;
  speed: number;
  reliability: number;
}

export interface CostStrategy {
  agentPool: {
    minIdle: number;
    maxBurst: number;
    scaleUpTime: number;
  };
  batching: {
    enabled: boolean;
    windowMs: number;
    similarityThreshold: number;
  };
  caching: {
    semantic: boolean;
    deterministic: boolean;
    ttlSeconds: number;
  };
  localVerification: {
    enabled: boolean;
    threshold: number;
  };
}
