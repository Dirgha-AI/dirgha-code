// @ts-nocheck
/**
 * UnifiedAgentClient - CLI access to full Agent-Server capabilities
 * All model traffic is Gateway-mediated (api.dirgha.ai) rather than direct-to-provider.
 */

// Stub for missing credentials module
const getCredentials = async () => ({ token: process.env.DIRGHA_API_KEY || '' });
import type { Message } from '../types.js';

const GATEWAY_URL = process.env.DIRGHA_GATEWAY_URL || 'https://api.dirgha.ai';

export interface AgentRequest {
  sessionId?: string;
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[] | 'all';
  streaming?: boolean;
  ephemeral?: boolean;
  metadata?: Record<string, any>;
}

export interface AgentResponse {
  id: string;
  sessionId: string;
  message: Message;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timing: {
    durationMs: number;
  };
}

export interface AgentEvent {
  type: 'message' | 'tool_start' | 'tool_end' | 'error' | 'done';
  data: any;
}

export class UnifiedAgentClient {
  private credentials: { accessToken: string } | null = null;
  private sessionId: string | null = null;

  async authenticate(): Promise<void> {
    this.credentials = await getCredentials();
    if (!this.credentials) {
      throw new Error('Not authenticated. Run `dirgha login` first.');
    }
  }

  /**
   * Execute agent request with full tool access
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    if (!this.credentials) {
      await this.authenticate();
    }

    const response = await fetch(`${GATEWAY_URL}/api/v1/agent/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials!.accessToken}`,
        'Content-Type': 'application/json',
        'X-Session-Id': this.sessionId || '',
      },
      body: JSON.stringify({
        ...request,
        tools: request.tools ?? 'all', // ✅ Full tool access!
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Agent execution failed: ${response.status} - ${error}`);
    }

    const result: AgentResponse = await response.json();

    // Track session ID for continuity
    if (result.sessionId) {
      this.sessionId = result.sessionId;
    }

    return result;
  }

  /**
   * Generic request method for standard API calls
   */
  async request(method: string, path: string, body?: any): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.credentials) {
      await this.authenticate();
    }

    const response = await fetch(`${GATEWAY_URL}/api${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.credentials!.accessToken || this.credentials!.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `${response.status} - ${error}` };
    }

    return { success: true, data: await response.json() };
  }

  /**
   * Stream agent response (SSE)
   */
  async *stream(request: AgentRequest): AsyncGenerator<AgentEvent> {
    if (!this.credentials) {
      await this.authenticate();
    }

    const response = await fetch(`${GATEWAY_URL}/api/v1/agent/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials!.accessToken}`,
        'Content-Type': 'application/json',
        'X-Session-Id': this.sessionId || '',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        ...request,
        streaming: true,
        tools: request.tools ?? 'all',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Agent stream failed: ${response.status} - ${error}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const event: AgentEvent = JSON.parse(data);
            yield event;

            // Track session from events
            if (event.type === 'message' && event.data?.sessionId) {
              this.sessionId = event.data.sessionId;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  }

  /**
   * List user's sessions
   */
  async listSessions(): Promise<Array<{ id: string; updatedAt: Date; source: string }>> {
    if (!this.credentials) {
      await this.authenticate();
    }

    const response = await fetch(`${GATEWAY_URL}/api/v1/agent/sessions`, {
      headers: {
        'Authorization': `Bearer ${this.credentials!.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to list sessions');
    }

    const result = await response.json();
    return result.sessions;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.credentials) {
      await this.authenticate();
    }

    const response = await fetch(`${GATEWAY_URL}/api/v1/agent/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.credentials!.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to delete session');
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Set session ID (for resuming sessions)
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }
}

// Singleton export
let client: UnifiedAgentClient | null = null;

export function getUnifiedAgentClient(): UnifiedAgentClient {
  if (!client) {
    client = new UnifiedAgentClient();
  }
  return client;
}
