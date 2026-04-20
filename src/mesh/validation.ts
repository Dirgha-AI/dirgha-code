// @ts-nocheck
import type { PeerId } from '@libp2p/interface/peer-id';
import { MESH_SECURITY_CONFIG } from './config.js';

const peerReputations = new Map<string, number>();
const blockedPeers = new Set<string>();

export function validatePeer(peerId: PeerId): boolean {
  const id = peerId.toString();
  
  const reputation = peerReputations.get(id) ?? 1.0;
  if (reputation < 0.2) {
    console.warn(`Rejecting low-reputation peer: ${id.slice(0, 16)}`);
    return false;
  }
  
  if (blockedPeers.has(id)) {
    return false;
  }
  
  return true;
}

export function validateMessage(data: Uint8Array): boolean {
  if (data.length > MESH_SECURITY_CONFIG.validation.maxMessageSize) {
    console.warn(`Message too large: ${data.length} bytes`);
    return false;
  }
  return true;
}

export function recordPeerReputation(peerId: PeerId, score: number): void {
  const id = peerId.toString();
  const current = peerReputations.get(id) ?? 1.0;
  peerReputations.set(id, Math.max(0, current + score));
}

export function blockPeer(peerId: PeerId): void {
  blockedPeers.add(peerId.toString());
}
