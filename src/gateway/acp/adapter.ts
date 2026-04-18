// @ts-nocheck
/**
 * gateway/acp/adapter.ts — ACP protocol adapter
 * Phase 3: Message encoding/decoding and protocol handling
 */

import { randomUUID } from 'node:crypto';
import type {
  AcpMessage,
  AcpPayload,
  AcpRequestPayload,
  AcpResponsePayload,
  AcpNotificationPayload,
  AcpHeartbeatPayload,
  AcpRegisterPayload,
  AcpDiscoverPayload,
  AcpError,
  ACP_VERSION,
} from './types.js';
import type { AgentAddress } from './types.js';

export class AcpAdapter {
  private static readonly VERSION: typeof ACP_VERSION = '1.0';
  
  /** Encode message to JSON string */
  static encode(message: AcpMessage): string {
    return JSON.stringify(message);
  }
  
  /** Decode JSON string to message */
  static decode(data: string): AcpMessage | null {
    try {
      const parsed = JSON.parse(data) as AcpMessage;
      
      // Validate required fields
      if (!parsed.id || !parsed.type || !parsed.from || !parsed.payload) {
        return null;
      }
      
      // Validate version
      if (parsed.version !== this.VERSION) {
        console.warn(`ACP version mismatch: ${parsed.version} vs ${this.VERSION}`);
      }
      
      return parsed;
    } catch {
      return null;
    }
  }
  
  /** Create a request message */
  static createRequest(
    from: AgentAddress,
    to: AgentAddress | undefined,
    method: string,
    params: Record<string, unknown>,
    taskId?: string
  ): AcpMessage {
    return {
      id: randomUUID(),
      version: this.VERSION,
      type: 'request',
      from,
      to,
      payload: {
        method,
        params,
        taskId,
      } as AcpRequestPayload,
      timestamp: new Date().toISOString(),
    };
  }
  
  /** Create a response message */
  static createResponse(
    from: AgentAddress,
    to: AgentAddress,
    requestId: string,
    result: unknown,
    error?: AcpError
  ): AcpMessage {
    return {
      id: randomUUID(),
      version: this.VERSION,
      type: 'response',
      from,
      to,
      payload: {
        requestId,
        success: !error,
        result: error ? undefined : result,
        error,
      } as AcpResponsePayload,
      timestamp: new Date().toISOString(),
    };
  }
  
  /** Create notification message */
  static createNotification(
    from: AgentAddress,
    event: string,
    data: unknown,
    priority: AcpNotificationPayload['priority'] = 'normal'
  ): AcpMessage {
    return {
      id: randomUUID(),
      version: this.VERSION,
      type: 'notification',
      from,
      payload: {
        event,
        data,
        priority,
      } as AcpNotificationPayload,
      timestamp: new Date().toISOString(),
    };
  }
  
  /** Create heartbeat message */
  static createHeartbeat(
    from: AgentAddress,
    status: AcpHeartbeatPayload['status'],
    load?: number,
    queuedTasks?: number
  ): AcpMessage {
    return {
      id: randomUUID(),
      version: this.VERSION,
      type: 'heartbeat',
      from,
      payload: {
        status,
        load,
        queuedTasks,
      } as AcpHeartbeatPayload,
      timestamp: new Date().toISOString(),
    };
  }
  
  /** Create registration message */
  static createRegister(
    from: AgentAddress,
    authToken?: string
  ): AcpMessage {
    return {
      id: randomUUID(),
      version: this.VERSION,
      type: 'register',
      from,
      payload: {
        agent: {
          id: from.id,
          name: from.id,
          description: '',
          capabilities: from.capabilities?.map(c => ({
            name: c,
            description: c,
          })) || [],
          trustLevel: 'anonymous',
          maxConcurrent: 1,
        },
        authToken,
      } as AcpRegisterPayload,
      timestamp: new Date().toISOString(),
    };
  }
  
  /** Create discovery message */
  static createDiscover(
    from: AgentAddress,
    query?: string,
    capabilities?: string[],
    limit?: number
  ): AcpMessage {
    return {
      id: randomUUID(),
      version: this.VERSION,
      type: 'discover',
      from,
      payload: {
        query,
        capabilities,
        limit,
      } as AcpDiscoverPayload,
      timestamp: new Date().toISOString(),
    };
  }
  
  /** Parse payload based on message type */
  static parsePayload(message: AcpMessage): AcpPayload | null {
    switch (message.type) {
      case 'request':
        return message.payload as AcpRequestPayload;
      case 'response':
        return message.payload as AcpResponsePayload;
      case 'notification':
        return message.payload as AcpNotificationPayload;
      case 'heartbeat':
        return message.payload as AcpHeartbeatPayload;
      case 'register':
        return message.payload as AcpRegisterPayload;
      case 'discover':
        return message.payload as AcpDiscoverPayload;
      default:
        return null;
    }
  }
  
  /** Create error object */
  static createError(code: string, message: string, details?: unknown): AcpError {
    return { code, message, details };
  }
  
  /** Common error codes */
  static readonly Errors = {
    UNKNOWN_METHOD: 'UNKNOWN_METHOD',
    INVALID_PARAMS: 'INVALID_PARAMS',
    AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
    TIMEOUT: 'TIMEOUT',
    UNAUTHORIZED: 'UNAUTHORIZED',
    RATE_LIMITED: 'RATE_LIMITED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    VERSION_MISMATCH: 'VERSION_MISMATCH',
  } as const;
  
  /** Check if message is expired */
  static isExpired(message: AcpMessage): boolean {
    if (!message.ttl) return false;
    const age = (Date.now() - new Date(message.timestamp).getTime()) / 1000;
    return age > message.ttl;
  }
  
  /** Get message age in seconds */
  static getAge(message: AcpMessage): number {
    return (Date.now() - new Date(message.timestamp).getTime()) / 1000;
  }
}

/** Export version constant */
export const ACP_VERSION: typeof AcpAdapter['VERSION'] = '1.0';
