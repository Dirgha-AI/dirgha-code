import { readState } from './state.js';

class UnifiedMemory {
  private _sessionId: string | null = null;
  private _projectId: string | null = null;

  async store(_k: string, _v: any) {}
  async retrieve(_k: string) { return null; }
  async search(_q: string) { return []; }
  resumeSession(id: string) { this._sessionId = id; }
  async getContext(_opts?: any) { return []; }

  startSession(projectId?: string, description?: string): { id: string } {
    this._sessionId = `session-${Date.now()}`;
    this._projectId = projectId || null;
    return { id: this._sessionId };
  }
  getCurrentSessionId(): string | null { return this._sessionId; }
  endSession(): void { this._sessionId = null; this._projectId = null; }
  getCurrentProjectId(): string | null { return this._projectId; }
  getSessionContext(): any[] { return []; }
}

const getUnifiedMemory = () => new UnifiedMemory();

let memory: UnifiedMemory | null = null;

export function getMemory(): UnifiedMemory {
  if (!memory) {
    memory = getUnifiedMemory();
    const state = readState();
    if (state.lastSessionId) {
      memory.resumeSession(state.lastSessionId);
    }
  }
  return memory;
}
