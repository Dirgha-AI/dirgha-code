/**
 * Workspace Isolation — Multi-tenant workspace support
 * Inspired by multica's workspace pattern
 * Each workspace has isolated: data, UI state, navigation
 */
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  visibility: "private" | "shared" | "public";
  ownerId: string;
  members: WorkspaceMember[];
  settings: WorkspaceSettings;
  createdAt: number;
}

export interface WorkspaceMember {
  userId: string;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: number;
}

export interface WorkspaceSettings {
  defaultModel?: string;
  allowedProviders?: string[];
  maxConcurrentTasks?: number;
  features?: string[];
}

export interface WorkspaceAware<T> {
  workspaceId: string;
  data: T;
}

export interface WorkspaceStore {
  // Workspace CRUD
  create(name: string, ownerId: string): Promise<Workspace>;
  getById(id: string): Promise<Workspace | null>;
  getByName(name: string): Promise<Workspace | null>;
  update(id: string, updates: Partial<Workspace>): Promise<void>;
  delete(id: string): Promise<void>;

  // Membership
  addMember(workspaceId: string, userId: string, role?: string): Promise<void>;
  removeMember(workspaceId: string, userId: string): Promise<void>;
  getMembers(workspaceId: string): Promise<WorkspaceMember[]>;

  // Queries scoped by workspace
  query<T>(
    workspaceId: string,
    data: Record<string, T>,
    filterFn?: (item: T) => boolean,
  ): T[];

  // Current workspace
  getCurrent(): string | null;
  setCurrent(workspaceId: string): void;
}

// In-memory implementation
const workspaceStore = new Map<string, Workspace>();
const membershipStore = new Map<string, WorkspaceMember[]>(); // workspaceId -> members
let currentWorkspaceId: string | null = null;

export const InMemoryWorkspaceStore: WorkspaceStore = {
  async create(name, ownerId) {
    const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ws: Workspace = {
      id,
      name,
      visibility: "private",
      ownerId,
      members: [{ userId: ownerId, role: "owner", joinedAt: Date.now() }],
      settings: {},
      createdAt: Date.now(),
    };
    workspaceStore.set(id, ws);
    return ws;
  },

  async getById(id) {
    return workspaceStore.get(id) ?? null;
  },

  async getByName(name) {
    return (
      Array.from(workspaceStore.values()).find((w) => w.name === name) ?? null
    );
  },

  async update(id, updates) {
    const ws = workspaceStore.get(id);
    if (!ws) throw new Error(`Workspace not found: ${id}`);
    Object.assign(ws, updates);
    workspaceStore.set(id, ws);
  },

  async delete(id) {
    workspaceStore.delete(id);
    membershipStore.delete(id);
    if (currentWorkspaceId === id) {
      currentWorkspaceId = null;
    }
  },

  async addMember(workspaceId, userId, role = "member") {
    if (!membershipStore.has(workspaceId)) {
      membershipStore.set(workspaceId, []);
    }
    const members = membershipStore.get(workspaceId)!;
    if (members.some((m) => m.userId === userId)) {
      throw new Error(
        `User ${userId} is already a member of workspace ${workspaceId}`,
      );
    }
    members.push({ userId, role: role as any, joinedAt: Date.now() });
  },

  async removeMember(workspaceId, userId) {
    const members = membershipStore.get(workspaceId);
    if (!members) return;
    const idx = members.findIndex((m) => m.userId === userId);
    if (idx !== -1) {
      members.splice(idx, 1);
    }
  },

  async getMembers(workspaceId) {
    return membershipStore.get(workspaceId) ?? [];
  },

  query(workspaceId, data, filterFn) {
    // Filter data to only include items for this workspace
    const results: any[] = [];
    for (const key of Object.keys(data)) {
      const item = data[key];
      if (
        item &&
        typeof item === "object" &&
        "workspaceId" in item &&
        (item as any).workspaceId === workspaceId
      ) {
        if (!filterFn || filterFn(item as any)) {
          results.push(item);
        }
      }
    }
    return results;
  },

  getCurrent() {
    return currentWorkspaceId;
  },

  setCurrent(workspaceId) {
    if (!workspaceStore.has(workspaceId)) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    currentWorkspaceId = workspaceId;
  },
};

/**
 * Create workspace-aware storage (from multica's createWorkspaceAwareStorage pattern)
 * Used in UI state management (Zustand, React Query)
 */
export function createWorkspaceAwareStorage<T extends Record<string, any>>(
  baseStorage: T,
  workspaceId: string,
): T {
  const prefix = `ws:${workspaceId}:`;

  return new Proxy(baseStorage, {
    get(target, prop) {
      const key = `${prefix}${String(prop)}`;
      return (target as any)[key];
    },
    set(target, prop, value) {
      const key = `${prefix}${String(prop)}`;
      (target as any)[key] = value;
      return true;
    },
  }) as T;
}
