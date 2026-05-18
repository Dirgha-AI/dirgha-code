/**
 * orchestra/core/registry.ts — In-memory registry of orchestra sessions.
 *
 * Single source of truth for all active orchestrations. Each session
 * holds N AgentSlots that reflect live subprocess state. The registry is
 * mutated by: agent manager (on spawn/exit), TUI (on user input), and
 * coordinator (on task assignment). No tmux, no external state.
 */
import { randomUUID } from "node:crypto";
class OrchestraRegistry {
    #sessions = new Map();
    create(overrides) {
        const id = overrides?.id ?? randomUUID().slice(0, 8);
        const now = Date.now();
        const session = {
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
    get(id) {
        return this.#sessions.get(id);
    }
    list() {
        return Array.from(this.#sessions.values());
    }
    update(id, patch) {
        const s = this.#sessions.get(id);
        if (!s)
            return undefined;
        Object.assign(s, patch, { updatedAt: Date.now() });
        return s;
    }
    remove(id) {
        const s = this.#sessions.get(id);
        if (s)
            this.#sessions.delete(id);
        return s;
    }
    addAgent(sessionId, agent) {
        const s = this.#sessions.get(sessionId);
        if (!s)
            return false;
        s.agents.push(agent);
        s.updatedAt = Date.now();
        return true;
    }
    removeAgent(sessionId, agentId) {
        const s = this.#sessions.get(sessionId);
        if (!s)
            return false;
        const idx = s.agents.findIndex((a) => a.id === agentId);
        if (idx === -1)
            return false;
        s.agents.splice(idx, 1);
        s.updatedAt = Date.now();
        return true;
    }
    getAgent(sessionId, agentId) {
        const s = this.#sessions.get(sessionId);
        if (!s)
            return undefined;
        return s.agents.find((a) => a.id === agentId);
    }
    updateAgent(sessionId, agentId, patch) {
        const s = this.#sessions.get(sessionId);
        if (!s)
            return undefined;
        const agent = s.agents.find((a) => a.id === agentId);
        if (!agent)
            return undefined;
        Object.assign(agent, patch);
        s.updatedAt = Date.now();
        return agent;
    }
    /** Append a line to an agent's output ring buffer (last 200 lines). */
    appendOutput(sessionId, agentId, line) {
        const agent = this.getAgent(sessionId, agentId);
        if (!agent)
            return;
        agent.outputBuffer.push(line);
        if (agent.outputBuffer.length > 200) {
            agent.outputBuffer.splice(0, agent.outputBuffer.length - 200);
        }
    }
    clear() {
        this.#sessions.clear();
    }
    get size() {
        return this.#sessions.size;
    }
}
export const registry = new OrchestraRegistry();
//# sourceMappingURL=registry.js.map