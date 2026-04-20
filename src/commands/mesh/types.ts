// @ts-nocheck
import { BuckyNode } from '@dirgha/bucky/mesh';
import { MeshLLMAdapter } from '@dirgha/bucky/mesh-llm';
import { LightningService } from '@dirgha/bucky/payments';
import { ConsensusEngine } from '@dirgha/bucky/consensus';

export interface MeshContext {
  node?: BuckyNode;
  adapter?: MeshLLMAdapter;
  lightning?: LightningService;
  consensus?: ConsensusEngine;
  userId?: string;
  pool?: any;
  billing?: any;
}

export interface MeshJoinOptions {
  team: string;
  workspace: string;
  cpu: string;
  memory: string;
  port: string;
}

export interface MeshAskOptions {
  model: string;
  maxTokens: string;
  temperature: string;
  priority: string;
  strategy?: 'least-loaded' | 'lowest-cost' | 'highest-reputation' | 'closest';
  verifiers?: string;
  verify?: 'true' | 'false';
}

export interface MeshAddMemberOptions {
  id: string;
  name: string;
  email: string;
  role: string;
  quota?: string;
}
