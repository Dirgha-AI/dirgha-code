export type MsgRole = 'user' | 'assistant' | 'system' | 'tool' | 'tool-group';

export interface ActiveTurn {
  name: string;
  label: string;
  input: Record<string, unknown>;
  startedAt: number;
  agentNum?: number;
}

export interface ToolCall {
  name: string;
  label: string;
  arg?: string;
}

export interface ChatMsg {
  id: string;
  role: MsgRole;
  content: string;
  tool?: string;
  /** For role='tool-group': all tool calls in this turn */
  tools?: ToolCall[];
  tokens?: number;
  model?: string;
  ts: number;
  rendered?: string;
  thinking?: string;
  isLogo?: boolean;
  isDim?: boolean;
}
