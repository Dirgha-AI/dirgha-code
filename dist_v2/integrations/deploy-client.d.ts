/**
 * Dirgha Deploy client. Talks to the gateway deploy routes (port 3001
 * in development, api.dirgha.ai in production). Supports project CRUD,
 * deployment trigger + rollback, a CLI tarball upload endpoint, and a
 * Server-Sent-Events log stream.
 */
export interface Project {
    id: string;
    name: string;
    provider: string;
    region: string;
    domains: string[];
    createdAt: string;
}
export interface Deployment {
    id: string;
    projectId: string;
    status: 'queued' | 'building' | 'ready' | 'failed' | 'rolled_back';
    url?: string;
    commitSha?: string;
    createdAt: string;
}
export interface DeployClientOptions {
    baseUrl?: string;
    timeoutMs?: number;
}
export declare function createDeployClient(opts?: DeployClientOptions): {
    projects: {
        list(token: string): Promise<{
            projects: Project[];
        }>;
        create(project: Partial<Project> & {
            name: string;
        }, token: string): Promise<Project>;
        get(id: string, token: string): Promise<Project>;
        update(id: string, patch: Partial<Project>, token: string): Promise<Project>;
        remove(id: string, token: string): Promise<{
            ok: boolean;
        }>;
    };
    deployments: {
        list(projectId: string, token: string): Promise<{
            deployments: Deployment[];
        }>;
        trigger(projectId: string, input: {
            commitSha: string;
            commitMessage: string;
        }, token: string): Promise<Deployment>;
        rollback(projectId: string, deploymentId: string, token: string): Promise<Deployment>;
        logs(deploymentId: string, token: string): AsyncIterable<{
            ts: string;
            stream: "stdout" | "stderr" | "system";
            line: string;
        }>;
    };
    cli: {
        upload(projectId: string, tarballPath: string, token: string): Promise<Deployment>;
    };
};
export type DeployClient = ReturnType<typeof createDeployClient>;
