// @ts-nocheck
/**
 * Mesh Node - P2P CPU sharing for team LLM inference
 * Each team member runs this daemon to share idle compute
 */

import EventEmitter from 'events';
import { createLibp2p, Libp2pOptions } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { mplex } from '@libp2p/mplex';
import { noise } from '@libp2p/noise';
import { gossipsub } from '@libp2p/gossipsub';
import { kadDHT as dht } from '@libp2p/kad-dht';

export interface MeshNodeConfig {
  teamId?: string;
  workspaceId?: string;
  nodeId: string;
  isPublic?: boolean;         // Enable public discovery (no teamId isolation)
  maxCpuPercent: number;      // Max CPU to share (default: 50%)
  maxMemoryGb: number;        // Max RAM to share (default: 4GB)
  ollamaPort: number;         // Local Ollama port (default: 11434)
  listenPort: number;         // P2P port (default: 0 = random)
  bootstrapPeers?: string[];  // Initial peers to connect
  remoteMeshes?: string[];    // External OpenAI-compatible mesh URLs (e.g. mesh-llm)
}

export interface NodeResources {
  cpuCores: number;
  totalMemoryGb: number;
  availableMemoryGb: number;
  gpuCount: number;
  models: string[];           // Locally cached models
}

export interface MeshPeer {
  id: string;
  multiaddrs: string[];
  resources: NodeResources;
  latencyMs: number;
  lastSeen: Date;
  isOnline: boolean;
  isRemote?: boolean;         // True if this is an external bridge (e.g. mesh-llm)
}

export interface InferenceRequest {
  id: string;
  model: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  requestedBy: string;
  priority: 'low' | 'normal' | 'high';
}

export interface InferenceResult {
  id: string;
  requestId: string;
  content: string;
  tokensGenerated: number;
  latencyMs: number;
  verified: boolean;
  verifiedBy?: string[];
}

export class MeshNode extends EventEmitter {
  private config: MeshNodeConfig;
  private node: any; // Libp2p node
  private peers: Map<string, MeshPeer> = new Map();
  private peerCapabilities: Map<string, { models: string[]; load: number; latencyMs: number }> = new Map();
  private localResources: NodeResources;
  private isRunning = false;

  constructor(config: MeshNodeConfig) {
    super();
    this.config = {
      maxCpuPercent: 50,
      maxMemoryGb: 4,
      ollamaPort: 11434,
      listenPort: 0,
      isPublic: false,
      remoteMeshes: [],
      ...config,
    };
    this.localResources = this.detectResources();
    
    // Add remote meshes as static "peers"
    for (const url of this.config.remoteMeshes || []) {
      const id = `remote-${crypto.createHash('md5').update(url).digest('hex')}`;
      this.peers.set(id, {
        id,
        multiaddrs: [url],
        resources: { cpuCores: 0, totalMemoryGb: 0, availableMemoryGb: 0, gpuCount: 0, models: [] },
        latencyMs: 100,
        lastSeen: new Date(),
        isOnline: true,
        isRemote: true
      });
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    const options: Libp2pOptions = {
      transports: [tcp()],
      streamMuxers: [mplex()],
      connectionEncryption: [noise()],
      pubsub: gossipsub(),
      dht: dht(),
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${this.config.listenPort}`],
      },
    };

    this.node = await createLibp2p(options);
    
    // Set node ID
    this.config.nodeId = this.node.peerId.toString();

    // Handle peer discovery
    this.node.addEventListener('peer:discovery', (evt: any) => {
      this.handlePeerDiscovery(evt.detail);
    });

    // Handle peer connections
    this.node.addEventListener('peer:connect', (evt: any) => {
      this.handlePeerConnect(evt.detail);
    });

    // Subscribe to topics
    const topics = ['dirgha-mesh/public'];
    if (this.config.teamId && this.config.workspaceId) {
      topics.push(`dirgha-mesh/${this.config.teamId}/${this.config.workspaceId}`);
    }

    for (const topic of topics) {
      await this.node.pubsub.subscribe(topic);
    }

    this.node.pubsub.addEventListener('message', (evt: any) => {
      this.handlePubsubMessage(evt.detail);
    });

    // Handle inference requests from other peers via direct protocol
    await this.node.handle('/dirgha-mesh/inference/1.0.0', async ({ stream }: any) => {
      const decoder = new TextDecoder();
      let data = '';
      for await (const chunk of stream.source) {
        const bytes = chunk.subarray ? chunk.subarray() : new Uint8Array(chunk);
        data += decoder.decode(bytes);
      }
      const request = JSON.parse(data) as InferenceRequest;
      const result = await this.executeLocalInference(request);
      const encoder = new TextEncoder();
      await stream.sink([encoder.encode(JSON.stringify(result))]);
    });

    // Announce presence and capabilities
    await this.announcePresence();
    await this.broadcastCapabilities();
    
    // Fetch remote mesh models if any
    this.fetchRemoteModels().catch(console.error);

    this.isRunning = true;
    this.emit('started', { nodeId: this.config.nodeId });

    // Periodic announcements
    setInterval(() => this.announcePresence(), 30000);
    setInterval(() => this.broadcastCapabilities(), 30000);
    setInterval(() => this.fetchRemoteModels(), 300000);
  }

  private async fetchRemoteModels(): Promise<void> {
    for (const [id, peer] of this.peers) {
      if (peer.isRemote) {
        try {
          const res = await fetch(`${peer.multiaddrs[0]}/v1/models`, { signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            const data = await res.json() as any;
            const models = data.data?.map((m: any) => m.id) || [];
            this.peerCapabilities.set(id, { models, load: 0, latencyMs: 100 });
            peer.resources.models = models;
          }
        } catch (e) {
          console.warn(`[MeshNode] Failed to fetch models from remote mesh ${peer.multiaddrs[0]}`);
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    await this.node.stop();
    this.isRunning = false;
    this.emit('stopped');
  }

  private detectResources(): NodeResources {
    const os = require('os');
    return {
      cpuCores: os.cpus().length,
      totalMemoryGb: Math.floor(os.totalmem() / 1024 / 1024 / 1024),
      availableMemoryGb: Math.floor(this.config.maxMemoryGb),
      gpuCount: 0, // Detect via nvidia-smi or rocm-smi
      models: [], // Query Ollama for cached models
    };
  }

  private async announcePresence(): Promise<void> {
    const message = {
      type: 'presence',
      nodeId: this.config.nodeId,
      resources: this.localResources,
      timestamp: Date.now(),
    };

    const topics = ['dirgha-mesh/public'];
    if (this.config.teamId && this.config.workspaceId) {
      topics.push(`dirgha-mesh/${this.config.teamId}/${this.config.workspaceId}`);
    }

    const encoder = new TextEncoder();
    for (const topic of topics) {
      await this.node.pubsub.publish(topic, encoder.encode(JSON.stringify(message)));
    }
  }

  private handlePeerDiscovery(peer: any): void {
    this.emit('peer:discovered', { peerId: peer.id.toString() });
  }

  private async handlePeerConnect(connection: any): Promise<void> {
    // Exchange resource info with new peer
    this.emit('peer:connected', { 
      peerId: connection.remotePeer.toString(),
      multiaddr: connection.remoteAddr.toString(),
    });
  }

  private handlePubsubMessage(message: any): void {
    try {
      const data = JSON.parse(new TextDecoder().decode(message.data));
      
      switch (data.type) {
        case 'presence':
          this.updatePeerInfo(data.nodeId, data);
          break;
        case 'node:capabilities':
          this.peerCapabilities.set(data.nodeId, {
            models: data.models || [],
            load: data.load || 0,
            latencyMs: 0,
          });
          break;
        case 'inference:request':
          this.handleInferenceRequest(data);
          break;
        case 'inference:result':
          this.emit('inference:result', data);
          break;
        case 'inference:verify':
          this.handleVerificationRequest(data);
          break;
      }
    } catch (err) {
      // Ignore malformed messages
    }
  }

  private updatePeerInfo(peerId: string, data: any): void {
    if (this.peers.has(peerId) && this.peers.get(peerId)?.isRemote) return;
    this.peers.set(peerId, {
      id: peerId,
      multiaddrs: [],
      resources: data.resources,
      latencyMs: 0,
      lastSeen: new Date(),
      isOnline: true,
    });
    this.emit('peer:updated', { peerId });
  }

  private async handleInferenceRequest(request: InferenceRequest): Promise<void> {
    // Check if we can handle this request
    if (!this.canHandleRequest(request)) return;

    // Execute via local Ollama
    const result = await this.executeLocalInference(request);

    // Publish result back
    const topic = this.config.teamId ? `dirgha-mesh/${this.config.teamId}/${this.config.workspaceId}` : 'dirgha-mesh/public';
    await this.node.pubsub.publish(
      topic,
      new TextEncoder().encode(JSON.stringify(result))
    );
  }

  private canHandleRequest(request: InferenceRequest): boolean {
    // Check model availability
    if (!this.localResources.models.includes(request.model)) {
      return false;
    }
    // Check resource availability
    // TODO: Implement proper resource tracking
    return true;
  }

  private async executeLocalInference(request: InferenceRequest): Promise<InferenceResult> {
    const start = Date.now()
    const LLAMACPP_URL = process.env.LLAMACPP_URL ?? 'http://localhost:8080'
    const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'

    // Try llama-server (OpenAI format)
    try {
      const r = await fetch(`${LLAMACPP_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local',
          messages: [{ role: 'user', content: request.prompt }],
          max_tokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (r.ok) {
        const d = await r.json() as any
        return {
          id: crypto.randomUUID(), requestId: request.id,
          content: d.choices?.[0]?.message?.content ?? '',
          tokensGenerated: d.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - start, verified: false,
        }
      }
    } catch {}

    // Fallback: Ollama
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model, prompt: request.prompt, stream: false,
        options: { temperature: request.temperature ?? 0.7, num_predict: request.maxTokens ?? 2048 }
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!r.ok) throw new Error(`No local LLM available (llama-server:8080, Ollama:11434)`)
    const d = await r.json() as any
    return {
      id: crypto.randomUUID(), requestId: request.id,
      content: d.response ?? '', tokensGenerated: d.eval_count ?? 0,
      latencyMs: Date.now() - start, verified: false,
    }
  }

  private async handleVerificationRequest(data: any): Promise<void> {
    // Re-run inference for verification (PBFT-style consensus)
    const result = await this.executeLocalInference(data.originalRequest);
    
    // Publish verification
    const topic = this.config.teamId ? `dirgha-mesh/${this.config.teamId}/${this.config.workspaceId}` : 'dirgha-mesh/public';
    await this.node.pubsub.publish(
      topic,
      new TextEncoder().encode(JSON.stringify({
        type: 'inference:verified',
        originalResultId: data.resultId,
        verifierId: this.config.nodeId,
        matches: this.compareResults(data.originalResult, result.content),
      }))
    );
  }

  private async broadcastCapabilities(): Promise<void> {
    const topics = ['dirgha-mesh/public'];
    if (this.config.teamId && this.config.workspaceId) {
      topics.push(`dirgha-mesh/${this.config.teamId}/${this.config.workspaceId}`);
    }
    
    const caps = {
      type: 'node:capabilities',
      nodeId: this.node.peerId.toString(),
      resources: this.localResources,
      models: this.localResources.models,
      timestamp: Date.now(),
    };
    const encoder = new TextEncoder();
    for (const topic of topics) {
      await this.node.pubsub.publish(topic, encoder.encode(JSON.stringify(caps)));
    }
  }

  async routeInference(request: InferenceRequest): Promise<InferenceResult> {
    const capable = this.findCapablePeer(request.model);

    if (capable && capable.isOnline) {
      try {
        if (capable.isRemote) {
          return await this.sendToRemoteMesh(capable.multiaddrs[0], request);
        } else {
          return await this.sendToPeer(capable.id, request);
        }
      } catch (e) {
        console.warn('[MeshNode] Peer routing failed, falling back to local:', e);
      }
    }

    return this.executeLocalInference(request);
  }

  private findCapablePeer(model: string): MeshPeer | null {
    const capable = Array.from(this.peers.values())
      .filter(p => {
        const caps = this.peerCapabilities.get(p.id);
        return p.isOnline && caps?.models.includes(model);
      })
      .sort((a, b) => {
        const loadA = this.peerCapabilities.get(a.id)?.load ?? 1;
        const loadB = this.peerCapabilities.get(b.id)?.load ?? 1;
        if (loadA !== loadB) return loadA - loadB;
        return a.latencyMs - b.latencyMs;
      });
    return capable[0] ?? null;
  }

  private async sendToPeer(peerId: string, request: InferenceRequest): Promise<InferenceResult> {
    const stream = await this.node.dialProtocol(peerId, '/dirgha-mesh/inference/1.0.0');
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    await stream.sink([encoder.encode(JSON.stringify(request))]);

    let result = '';
    for await (const chunk of stream.source) {
      const bytes = chunk.subarray ? chunk.subarray() : new Uint8Array(chunk);
      result += decoder.decode(bytes);
    }

    return JSON.parse(result) as InferenceResult;
  }

  private async sendToRemoteMesh(baseUrl: string, request: InferenceRequest): Promise<InferenceResult> {
    const start = Date.now();
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: [{ role: 'user', content: request.prompt }],
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0.7,
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    
    if (!res.ok) throw new Error(`Remote mesh ${baseUrl} failed: ${res.statusText}`);
    const data = await res.json() as any;
    
    return {
      id: crypto.randomUUID(),
      requestId: request.id,
      content: data.choices?.[0]?.message?.content ?? '',
      tokensGenerated: data.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
      verified: false,
    };
  }

  private compareResults(a: string, b: string): boolean {
    // Simple semantic comparison (can be enhanced with embeddings)
    return a.trim() === b.trim();
  }

  getPeers(): MeshPeer[] {
    return Array.from(this.peers.values());
  }

  getAggregatedResources(): NodeResources {
    const allPeers = this.getPeers();
    return {
      cpuCores: this.localResources.cpuCores + 
        allPeers.reduce((sum, p) => sum + p.resources.cpuCores, 0),
      totalMemoryGb: this.localResources.totalMemoryGb +
        allPeers.reduce((sum, p) => sum + p.resources.totalMemoryGb, 0),
      availableMemoryGb: this.localResources.availableMemoryGb +
        allPeers.reduce((sum, p) => sum + p.resources.availableMemoryGb, 0),
      gpuCount: this.localResources.gpuCount +
        allPeers.reduce((sum, p) => sum + p.resources.gpuCount, 0),
      models: [...new Set([
        ...this.localResources.models,
        ...allPeers.flatMap(p => p.resources.models),
      ])],
    };
  }
}

export default MeshNode;
