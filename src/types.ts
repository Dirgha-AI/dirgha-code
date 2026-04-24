export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | any[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolResult {
  tool: string;
  result: string;
  /** Runtime host-tools extended fields */
  success?: boolean;
  output?: string;
  error?: string;
}

export interface ModelResponse {
  content: ContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
  stop_reason?: string;
}

export interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, any>;
}

export interface ProjectConfig {
  version: string;
  project: {
    name: string;
    root: string;
    type: string;
    detectedAt: string;
  };
  context: ProjectContext;
  preferences: {
    defaultModel: string;
    defaultProvider: 'gateway' | 'anthropic' | 'openrouter' | 'nvidia';
    autoApply: boolean;
    verbose: boolean;
    theme?: ThemeName;
    reasoningEffort?: 'low' | 'medium' | 'high';
    soul?: string;
    language?: string;
  };
  platforms?: Record<string, {
    enabled: boolean;
    [key: string]: any;
  }>;
}

export interface ProjectContext {
  files: string[];
  structure: {
    root: string;
    directories: string[];
    fileCount: number;
    maxDepth: number;
  };
  dependencies: {
    manager: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    totalCount: number;
  };
  git: {
    branch: string;
    remote: string;
    lastCommit: string;
    isClean: boolean;
  } | null;
  importantFiles: string[];
  ignoredPatterns: string[];
}

// ── v2 Permission System ───────────────────────────────────────────────────
export type PermissionLevel = 'ReadOnly' | 'WorkspaceWrite' | 'DangerFullAccess' | 'Prompt' | 'Allow';

// ── v2 Hooks ──────────────────────────────────────────────────────────────
export interface HookEvent {
  type: 'pre-tool' | 'post-tool';
  tool: string;
  input: Record<string, unknown>;
  result?: string;
  error?: string;
}

export type HookResult = { block: false } | { block: true; reason: string };

// ── v2 Session Persistence ────────────────────────────────────────────────
export interface SessionFile {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  tokensUsed: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionIndex {
  sessions: Array<{ id: string; title: string; createdAt: string; model: string; }>;
}

// ── v2 Checkpoint ─────────────────────────────────────────────────────────
export interface Checkpoint {
  id: string;
  timestamp: string;
  description: string;
  cwd: string;
  gitRef: string;
}

// ── v2 TODO ───────────────────────────────────────────────────────────────
export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

// ── v2 Theme ──────────────────────────────────────────────────────────────
export type ThemeName = 'default' | 'midnight' | 'ocean' | 'matrix' | 'warm'
  | 'violet-storm' | 'cosmic' | 'nord' | 'ember' | 'sakura' | 'obsidian-gold' | 'crimson';

// ── v2 Model Routing ──────────────────────────────────────────────────────
export type ModelTier = 'fast' | 'full' | 'auto';

// ── v2 Auth Error ─────────────────────────────────────────────────────────
export class AuthError extends Error {
  constructor(message = 'Not authenticated. Run: dirgha login') {
    super(message);
    this.name = 'AuthError';
  }
}

// ── Slash-command streaming output sink ───────────────────────────────────
export interface ReplStream {
  markdown: (text: string) => void;
  write?: (text: string) => void;
}

/** Default stream that prints to stdout — used when no UI stream is provided */
export const consoleStream: ReplStream = {
  markdown: (text: string) => process.stdout.write(text + '\n'),
  write: (text: string) => process.stdout.write(text),
};

export interface DirghaAppProps {
  initialPrompt?: string;
  resumeSessionId?: string;
  maxBudgetUsd?: number;
}

// ── v2 REPL Context ───────────────────────────────────────────────────────
export interface ReplContext {
  messages: Message[];
  model: string;
  totalTokens: number;
  toolCallCount: number;
  sessionId: string;
  isPlanMode: boolean;
  isYolo: boolean;
  modelTier: ModelTier;
  todos: TodoItem[];
  permissionLevel: PermissionLevel;
  activeTheme: ThemeName;
  /** Output sink for slash commands that stream results */
  stream: ReplStream;
  /** Print method — always defined, alias for stream.markdown */
  print: (text: string) => void;
  /** Working directory for slash commands */
  cwd: string;
  /** Legacy session accessor used by some slash commands */
  session?: { messages: Message[]; [key: string]: unknown };
  // Extended workflow fields
  bugHunterMode?: boolean;
  systemOverrides?: string[];
  pendingTeleport?: string;
  subAgents?: Array<{ id: string; type: string; status: string }>;
}

export interface DiffLine {
  kind: '+' | '-' | ' ';
  text: string;
  oldNum?: number;
  newNum?: number;
}
