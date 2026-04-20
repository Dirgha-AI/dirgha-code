export interface StreamEvent {
  type: 'thought' | 'tool_start' | 'tool_end' | 'text';
  id?: string; // taskId
  toolId?: string; // id of the specific tool call
  content?: string;
  result?: string;
  isError?: boolean;
  tool?: {
    id: string;
    name: string;
    label: string;
    arg: string;
    startedAt: number;
    status: 'running';
  };
}

export interface StreamContainerProps {
  events: StreamEvent[];
  isStreaming?: boolean;
}
