/**
 * orchestra/core/registry.ts — In-memory registry of orchestra sessions.
 *
 * Single source of truth for all active orchestrations. Each session
 * holds N AgentSlots that reflect live subprocess state. The registry is
 * mutated by: agent manager (on spawn/exit), TUI (on user input), and
 * coordinator (on task assignment). No tmux, no external state.
 */
import type { OrchestraSession, AgentSlot } from "./types.js";
declare class OrchestraRegistry {
    #private;
    create(overrides?: Partial<OrchestraSession>): OrchestraSession;
    get(id: string): OrchestraSession | undefined;
    list(): OrchestraSession[];
    update(id: string, patch: Partial<OrchestraSession>): OrchestraSession | undefined;
    remove(id: string): OrchestraSession | undefined;
    addAgent(sessionId: string, agent: AgentSlot): boolean;
    removeAgent(sessionId: string, agentId: string): boolean;
    getAgent(sessionId: string, agentId: string): AgentSlot | undefined;
    updateAgent(sessionId: string, agentId: string, patch: Partial<AgentSlot>): AgentSlot | undefined;
    /** Append a line to an agent's output ring buffer (last 200 lines). */
    appendOutput(sessionId: string, agentId: string, line: string): void;
    clear(): void;
    get size(): number;
}
export declare const registry: OrchestraRegistry;
export {};
