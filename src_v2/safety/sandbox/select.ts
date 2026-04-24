/**
 * Sandbox selector. Picks the best available adapter for the current
 * platform. DIRGHA_SANDBOX env overrides the choice.
 */

import { platform as osPlatform } from 'node:os';
import type { SandboxAdapter } from './iface.js';
import { NoopSandbox } from './noop.js';
import { SeatbeltSandbox } from './seatbelt.js';
import { BwrapSandbox } from './bwrap.js';
import { LandlockSandbox } from './landlock.js';
import { WindowsSandbox } from './windows.js';

export async function selectSandbox(override?: string): Promise<SandboxAdapter> {
  const choice = override ?? process.env.DIRGHA_SANDBOX;
  if (choice === 'noop') return new NoopSandbox();
  if (choice === 'seatbelt') return new SeatbeltSandbox();
  if (choice === 'landlock') return new LandlockSandbox();
  if (choice === 'bwrap') return new BwrapSandbox();
  if (choice === 'windows') return new WindowsSandbox();

  const current = osPlatform();
  if (current === 'darwin') {
    const seatbelt = new SeatbeltSandbox();
    if (await seatbelt.available()) return seatbelt;
  }
  if (current === 'linux') {
    const landlock = new LandlockSandbox();
    if (await landlock.available()) return landlock;
    const bwrap = new BwrapSandbox();
    if (await bwrap.available()) return bwrap;
  }
  if (current === 'win32') {
    return new WindowsSandbox();
  }
  return new NoopSandbox();
}
