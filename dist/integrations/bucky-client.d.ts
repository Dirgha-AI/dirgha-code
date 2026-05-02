/**
 * Bucky client. Thin wrapper over the Hono.js service (default port
 * 3002). All methods take an explicit bearer token argument so callers
 * can control scope (gateway passthrough vs anonymous for public
 * endpoints).
 */
export interface BuckyTask {
    id: string;
    status: string;
    title: string;
    payload?: unknown;
}
export interface Team {
    id: string;
    name: string;
    members?: string[];
}
export interface MeshStatus {
    peerCount: number;
    peers: Array<{
        id: string;
        addr?: string;
    }>;
}
export interface CodeBlock {
    id: string;
    code: string;
    language: string;
    createdAt: string;
}
export interface Proposal {
    id: string;
    title: string;
    description: string;
    status: string;
}
export interface VmHandle {
    vmId: string;
    endpoint?: string;
}
export interface BuckyClientOptions {
    baseUrl?: string;
    timeoutMs?: number;
}
export declare function createBuckyClient(opts?: BuckyClientOptions): {
    tasks: {
        list(token?: string): Promise<{
            tasks: BuckyTask[];
        }>;
        submit(payload: unknown, token?: string): Promise<BuckyTask>;
    };
    dao: {
        listTeams(token?: string): Promise<{
            teams: Team[];
        }>;
        getTeam(id: string, token?: string): Promise<Team>;
    };
    mesh: {
        status(token?: string): Promise<MeshStatus>;
    };
    lightning: {
        balance(token?: string): Promise<{
            sats: number;
        }>;
    };
    reputation: {
        get(userId: string, token?: string): Promise<{
            userId: string;
            score: number;
        }>;
    };
    code: {
        register(code: string, language: string, token?: string): Promise<{
            id: string;
        }>;
        get(id: string, token?: string): Promise<CodeBlock>;
        list(token?: string): Promise<{
            blocks: CodeBlock[];
        }>;
    };
    governance: {
        propose(proposal: Partial<Proposal> & {
            proposer: string;
            title: string;
        }, token?: string): Promise<Proposal>;
        vote(vote: {
            proposalId: string;
            voterId: string;
            balance: number;
            direction: 'yes' | 'no';
        }, token?: string): Promise<{
            ok: boolean;
        }>;
        list(token?: string): Promise<{
            proposals: Proposal[];
        }>;
    };
    vm: {
        create(cpuCount: number, memoryMB: number, token?: string): Promise<VmHandle>;
        destroy(vmId: string, token?: string): Promise<{
            ok: boolean;
        }>;
    };
};
export type BuckyClient = ReturnType<typeof createBuckyClient>;
