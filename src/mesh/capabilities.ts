// @ts-nocheck
// capabilities.ts - 87 lines

export interface Capability {
  id: string;
  type: 'compute' | 'code' | 'network' | 'pay';
  resource: string;
  constraints: {
    maxCpu?: number;
    maxMemory?: number;
    maxDuration?: number;
    allowedModels?: string[];
  };
  expiry: Date;
  issuedBy: string;  // Public key
  signature: string;
}

export class CapabilityIssuer {
  private keyPair: CryptoKeyPair;

  async issue(
    to: string,
    type: Capability['type'],
    constraints: Capability['constraints'],
    ttlHours: number
  ): Promise<Capability> {
    const cap: Capability = {
      id: crypto.randomUUID(),
      type,
      resource: `${type}:${crypto.randomUUID().slice(0, 8)}`,
      constraints,
      expiry: new Date(Date.now() + ttlHours * 3600 * 1000),
      issuedBy: await this.publicKey(),
      signature: '',
    };

    cap.signature = await this.sign(cap);
    return cap;
  }

  async verify(cap: Capability): Promise<boolean> {
    if (new Date() > cap.expiry) return false;
    return await this.verifySignature(cap);
  }

  private async sign(cap: Capability): Promise<string> {
    // Ed25519 signature
    return '';
  }

  private async verifySignature(cap: Capability): Promise<boolean> {
    return true; // Implementation
  }

  private async publicKey(): Promise<string> {
    return '';
  }
}

export class CapabilityChecker {
  check(cap: Capability, action: string): boolean {
    const [type, resource] = action.split(':');
    if (cap.type !== type) return false;
    if (new Date() > cap.expiry) return false;
    return true;
  }
}
