/**
 * Sandbox selector. Picks the best available adapter for the current
 * platform. DIRGHA_SANDBOX env overrides the choice.
 */
import type { SandboxAdapter } from './iface.js';
export declare function selectSandbox(override?: string): Promise<SandboxAdapter>;
