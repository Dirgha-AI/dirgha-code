/**
 * fleet/events.ts — Process-wide event emitter for Fleet runtime.
 *
 * The TUI FleetPanel subscribes to this to render live agent state.
 * CLI `dirgha fleet` and the slash command both publish here.
 */
import { EventEmitter } from 'node:events';
import type { FleetAgent } from './types.js';

export type FleetEvent = {
  type: 'state' | 'launch' | 'done';
  agents: FleetAgent[];
  goal?: string;
};

class FleetEventBus extends EventEmitter {
  current: FleetAgent[] = [];
  goal: string | null = null;
  active = false;

  emitState(agents: FleetAgent[]): void {
    this.current = agents;
    this.emit('state', { type: 'state', agents } satisfies FleetEvent);
  }

  emitLaunch(goal: string, agents: FleetAgent[]): void {
    this.active = true;
    this.goal = goal;
    this.current = agents;
    this.emit('launch', { type: 'launch', agents, goal } satisfies FleetEvent);
  }

  emitDone(agents: FleetAgent[]): void {
    this.active = false;
    this.current = agents;
    this.emit('done', { type: 'done', agents } satisfies FleetEvent);
  }

  clear(): void {
    this.active = false;
    this.current = [];
    this.goal = null;
    this.emit('state', { type: 'state', agents: [] } satisfies FleetEvent);
  }
}

export const fleetEvents = new FleetEventBus();
