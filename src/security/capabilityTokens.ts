/**
 * security/capabilityTokens.ts — Macaroons/UCAN-style capability tokens (P0)
 * Attenuatable, self-contained authorization tokens
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface Caveat {
  key: string;
  op: 'eq' | 'contains' | 'lt' | 'gt' | 'in' | 'regex';
  value: unknown;
}

export interface Capability {
  resource: string;
  action: string;
  caveats?: Caveat[];
}

export interface Token {
  id: string;
  issuer: string;
  audience: string;
  capabilities: Capability[];
  issuedAt: number;
  expiresAt: number;
  proof?: string; // Parent token signature for delegation
  signature: string;
}

const SECRET = process.env.CAPABILITY_SECRET || randomBytes(32).toString('hex');
const TOKEN_VERSION = 'v1';

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function verify(payload: string, sig: string): boolean {
  const expected = sign(payload);
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
}

function encodeBase64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function decodeBase64(str: string): unknown {
  return JSON.parse(Buffer.from(str, 'base64url').toString());
}

/**
 * Create a new capability token
 */
export function createCapabilityToken(
  issuer: string,
  audience: string,
  capabilities: Capability[],
  ttlSeconds = 3600,
  proof?: string
): string {
  const id = randomBytes(16).toString('hex');
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSeconds;
  
  const token: Omit<Token, 'signature'> = {
    id,
    issuer,
    audience,
    capabilities,
    issuedAt,
    expiresAt,
    proof,
  };
  
  const payload = `${TOKEN_VERSION}.${encodeBase64(token)}`;
  const signature = sign(payload);
  
  return `${payload}.${signature}`;
}

/**
 * Verify and decode a capability token
 */
export function verifyCapabilityToken(tokenStr: string): Token | null {
  const parts = tokenStr.split('.');
  if (parts.length !== 3) return null;
  
  const [version, payloadB64, signature] = parts;
  if (version !== TOKEN_VERSION) return null;
  
  const payload = `${version}.${payloadB64}`;
  if (!verify(payload, signature)) return null;
  
  const token = decodeBase64(payloadB64) as Token;
  token.signature = signature;
  
  const now = Math.floor(Date.now() / 1000);
  if (token.expiresAt < now) return null;
  
  return token;
}

/**
 * Attenuate (restrict) a token by adding caveats
 */
export function attenuateToken(
  tokenStr: string,
  newAudience: string,
  restrictions: { resource?: string; action?: string; caveats?: Caveat[] }
): string | null {
  const parent = verifyCapabilityToken(tokenStr);
  if (!parent) return null;
  
  const newCaps = parent.capabilities
    .filter(c => !restrictions.resource || c.resource === restrictions.resource)
    .filter(c => !restrictions.action || c.action === restrictions.action)
    .map(c => ({
      ...c,
      caveats: [...(c.caveats || []), ...(restrictions.caveats || [])],
    }));
  
  if (!newCaps.length) return null;
  
  return createCapabilityToken(
    parent.issuer,
    newAudience,
    newCaps,
    parent.expiresAt - Math.floor(Date.now() / 1000),
    tokenStr
  );
}

/**
 * Check if token authorizes an action
 */
export function authorizeAction(
  token: Token,
  resource: string,
  action: string,
  context?: Record<string, unknown>
): boolean {
  const cap = token.capabilities.find(
    c => (c.resource === resource || c.resource === '*') &&
         (c.action === action || c.action === '*')
  );
  
  if (!cap) return false;
  if (!cap.caveats?.length) return true;
  
  return cap.caveats.every(cv => checkCaveat(cv, context));
}

function checkCaveat(cv: Caveat, ctx?: Record<string, unknown>): boolean {
  const val = ctx?.[cv.key];
  switch (cv.op) {
    case 'eq': return val === cv.value;
    case 'contains': return typeof val === 'string' && val.includes(String(cv.value));
    case 'lt': return typeof val === 'number' && val < Number(cv.value);
    case 'gt': return typeof val === 'number' && val > Number(cv.value);
    case 'in': return Array.isArray(cv.value) && cv.value.includes(val);
    case 'regex': return typeof val === 'string' && new RegExp(String(cv.value)).test(val);
    default: return false;
  }
}

/**
 * Extract proof chain for audit
 */
export function getProofChain(tokenStr: string): string[] {
  const chain: string[] = [];
  let current = verifyCapabilityToken(tokenStr);
  
  while (current?.proof) {
    chain.push(current.id);
    current = verifyCapabilityToken(current.proof);
  }
  
  if (current) chain.push(current.id);
  return chain.reverse();
}
