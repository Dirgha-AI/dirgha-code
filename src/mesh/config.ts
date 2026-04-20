/**
 * Mesh configuration with security limits
 */

export const MESH_SECURITY_CONFIG = {
  maxConnections: 50,
  maxConnectionsPerPeer: 3,
  maxPendingConnections: 10,
  connectionTimeoutMs: 30000,
  idleTimeoutMs: 600000,

  rateLimits: {
    messagesPerSecond: 100,
    bytesPerSecond: 1024 * 1024,
    dialAttemptsPerMinute: 10,
  },

  validation: {
    requireSignedMessages: true,
    maxMessageSize: 10 * 1024 * 1024,
    rejectUnknownPeers: false,
  },

  dht: {
    maxRecordSize: 1024 * 1024,
    maxProvidersPerKey: 20,
    ttlSeconds: 24 * 60 * 60,
  },
};

export const GOSSIPSUB_SECURITY = {
  D: 4,
  DLow: 2,
  DHigh: 6,
  scoreThresholds: {
    gossipThreshold: -10,
    publishThreshold: -100,
    graylistThreshold: -1000,
  },
  asyncValidation: true,
  maxMeshSize: 20,
};
