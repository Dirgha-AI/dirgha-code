/**
 * project-session/types.ts — Project-Session-Branch (PTS) architecture
 * Complete type definitions for project isolation and session management
 */

// ===== PROJECT (Repository Level) =====

export interface Project {
  id: string;           // Unique project ID (hash of path)
  name: string;         // Human-readable name
  path: string;         // Absolute path to project root
  createdAt: string;
  updatedAt: string;
  config: ProjectConfig;
  stats: ProjectStats;
}

export interface ProjectConfig {
  defaultModel: string;
  autoSwitch: boolean;  // Auto-switch when entering directory
  linkedProjects: string[]; // Other projects this can access
  ignorePatterns: string[]; // Files to ignore in context
  maxContextSize: number;   // Max tokens for this project
}

export interface ProjectStats {
  sessionCount: number;
  totalTokensUsed: number;
  lastAccessed: string;
}

// ===== SESSION (Branch Level) =====

export interface Session {
  id: string;           // Session ID
  projectId: string;    // Parent project
  name: string;         // Session name (e.g., "main", "feature-x")
  parentId?: string;    // Parent session (for forks)
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  compressed: CompressedContext;  // AAAK compression
  tree: PalaceNode[];   // Palace file structure
  scratchpad: ScratchpadEntry[];
}

export type SessionStatus = 'active' | 'archived' | 'merged' | 'stashed';

export interface CompressedContext {
  summary: string;      // 170-token compressed summary
  version: number;
  compressedAt: string;
  originalTokens: number;
  compressedTokens: number;
}

export interface PalaceNode {
  path: string;
  type: 'file' | 'directory';
  importance: number;   // 0-1 relevance score
  lastAccessed: string;
  tokenCount: number;
}

export interface ScratchpadEntry {
  timestamp: string;
  action: string;
  tool?: string;
  result: 'success' | 'error' | 'pending';
  notes?: string;
}

// ===== CONTEXT (Working State) =====

export interface Context {
  projectId: string;
  sessionId: string;
  boundaries: Boundary[];
  stashId?: string;
}

export interface Boundary {
  type: 'directory' | 'project' | 'session' | 'explicit';
  value: string;
  allowRead: boolean;
  allowWrite: boolean;
}

// ===== STASH =====

export interface Stash {
  id: string;
  name: string;
  createdAt: string;
  context: Context;
  preview: string;      // First 100 chars of compressed context
}

// ===== CROSS-PROJECT =====

export interface ProjectLink {
  fromProjectId: string;
  toProjectId: string;
  alias: string;        // Short name for access
  permissions: ('read' | 'write')[];
  createdAt: string;
}
