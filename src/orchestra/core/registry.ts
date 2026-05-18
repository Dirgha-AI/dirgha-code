/**
 * orchestra/core/registry.ts — In-memory registry of orchestra sessions.
 *
 * Single source of truth for all active orchestrations. Each session
 * holds N AgentSlots that reflect live subprocess state. The registry is
 * mutated by: agent manager (on spawn/exit), TUI (on user input), and
 * coordinator (on task assignment). No tmux, no external state.
 */

import { randomUUID } from "node:crypto";
import type { OrchestraSession, AgentSlot } from "./types.js";

class OrchestraRegistry {
  #sessions = new Map<string, OrchestraSession>();

  create(overrides?: Partial<OrchestraSession>): OrchestraSession {
    const id = overrides?.id ?? randomUUID().slice(0, 8);
    const now = Date.now();
    const session: OrchestraSession = {
      id,
      title: `orchestra-${id}`,
      agents: [],
      active: false,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    this.#sessions.set(id, session);
    return session;
  }

  get(id: string): OrchestraSession | undefined {
    return this.#sessions.get(id);
  }

  list(): OrchestraSession[] {
    return Array.from(this.#sessions.values());
  }

  update(
    id: string,
    patch: Partial<OrchestraSession>,
  ): OrchestraSession | undefined {
    const s = this.#sessions.get(id);
    if (!s) return undefined;
    Object.assign(s, patch, { updatedAt: Date.now() });
    return s;
  }

  remove(id: string): OrchestraSession | undefined {
    const s = this.#sessions.get(id);
    if (s) this.#sessions.delete(id);
    return s;
  }

  addAgent(sessionId: string, agent: AgentSlot): boolean {
    const s = this.#sessions.get(sessionId);
    if (!s) return false;
    s.agents.push(agent);
    s.updatedAt = Date.now();
    return true;
  }

  removeAgent(sessionId: string, agentId: string): boolean {
    const s = this.#sessions.get(sessionId);
    if (!s) return false;
    const idx = s.agents.findIndex((a) => a.id === agentId);
    if (idx === -1) return false;
    s.agents.splice(idx, 1);
    s.updatedAt = Date.now();
    return true;
  }

  getAgent(sessionId: string, agentId: string): AgentSlot | undefined {
    const s = this.#sessions.get(sessionId);
    if (!s) return undefined;
    return s.agents.find((a) => a.id === agentId);
  }

  updateAgent(
    sessionId: string,
    agentId: string,
    patch: Partial<AgentSlot>,
  ): AgentSlot | undefined {
    const s = this.#sessions.get(sessionId);
    if (!s) return undefined;
    const agent = s.agents.find((a) => a.id === agentId);
    if (!agent) return undefined;
    Object.assign(agent, patch);
    s.updatedAt = Date.now();
    return agent;
  }

  /** Append a line to an agent's output ring buffer (last 200 lines). */
  appendOutput(sessionId: string, agentId: string, line: string): void {
    const agent = this.getAgent(sessionId, agentId);
    if (!agent) return;
    agent.outputBuffer.push(line);
    if (agent.outputBuffer.length > 200) {
      agent.outputBuffer.splice(0, agent.outputBuffer.length - 200);
    }
  }

  clear(): void {
    this.#sessions.clear();
  }

  get size(): number {
    return this.#sessions.size;
  }
}

export const registry = new OrchestraRegistry();
