/**
 * gateway/acp/types.ts — Agent Communication Protocol types
 * Phase 3: ACP protocol support
 */

import type { AgentId, TaskId } from '../../agent/orchestration/types.js';

/** ACP Message types */
export type AcpMessageType =
  | 'request'
  | 'response'
  | 'notification'
  | 'heartbeat'
  | 'register'
  | 'unregister'
  | 'discover';

/** ACP protocol version */
export const ACP_VERSION = '1.0';

/** ACP message envelope */
export interface AcpMessage {
  id: string;
  version: string;
  type: AcpMessageType;
  from: AgentAddress;
  to?: AgentAddress; // undefined = broadcast
  payload: AcpPayload;
  timestamp: string;
  ttl?: number; // seconds
  signature?: string; // for trusted agents
}

/** Agent addressing */
export interface AgentAddress {
  id: AgentId;
  endpoint?: string; // URL for remote agents
  capabilities?: string[];
}

/** ACP payload types */
export type AcpPayload =
  | AcpRequestPayload
  | AcpResponsePayload
  | AcpNotificationPayload
  | AcpHeartbeatPayload
  | AcpRegisterPayload
  | AcpDiscoverPayload;

/** Request payload */
export interface AcpRequestPayload {
  method: string;
  params: Record<string, unknown>;
  taskId?: TaskId;
}

/** Response payload */
export interface AcpResponsePayload {
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: AcpError;
}

/** Notification payload */
export interface AcpNotificationPayload {
  event: string;
  data: unknown;
  priority?: 'low' | 'normal' | 'high';
}

/** Heartbeat payload */
export interface AcpHeartbeatPayload {
  status: 'alive' | 'busy' | 'idle';
  load?: number; // 0-1
  queuedTasks?: number;
}

/** Registration payload */
export interface AcpRegisterPayload {
  agent: AgentInfo;
  authToken?: string;
}

/** Discovery payload */
export interface AcpDiscoverPayload {
  query?: string;
  capabilities?: string[];
  limit?: number;
}

/** Agent info for registry */
export interface AgentInfo {
  id: AgentId;
  name: string;
  description: string;
  capabilities: Capability[];
  endpoint?: string;
  trustLevel: 'anonymous' | 'basic' | 'verified' | 'trusted';
  maxConcurrent: number;
  metadata?: Record<string, unknown>;
}

/** Agent capability */
export interface Capability {
  name: string;
  description: string;
  parameters?: ParameterDef[];
  returns?: string;
  examples?: string[];
}

/** Parameter definition */
export interface ParameterDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description?: string;
  default?: unknown;
}

/** ACP error */
export interface AcpError {
  code: string;
  message: string;
  details?: unknown;
}

/** Registry entry */
export interface RegistryEntry {
  agent: AgentInfo;
  registeredAt: Date;
  lastSeen: Date;
  messageCount: number;
  status: 'online' | 'offline' | 'busy';
}

/** Gateway configuration */
export interface GatewayConfig {
  port: number;
  host: string;
  enableDiscovery: boolean;
  enableAuth: boolean;
  maxAgents: number;
  heartbeatInterval: number; // seconds
  messageTimeout: number; // seconds
}

/** Routing decision */
export interface RoutingDecision {
  target: AgentId;
  via?: string[]; // relay path
  priority: number;
  estimatedTime: number;
}
