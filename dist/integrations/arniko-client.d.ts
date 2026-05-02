/**
 * Arniko security scanner client. Supports code scans by string,
 * directory path, or git diff. When the service is unreachable, the
 * bootstrap() entry attempts to bring up the docker-compose file that
 * ships in the user's `~/.dirgha/arniko/` directory.
 */
export interface Finding {
    id: string;
    severity: "critical" | "high" | "medium" | "low";
    title: string;
    file?: string;
    line?: number;
    snippet?: string;
    reason: string;
}
export interface ScanResult {
    passed: boolean;
    findings: Finding[];
    maturityScore: number;
    taskId?: string;
    reason?: string;
}
export interface ArnikoClientOptions {
    baseUrl?: string;
    timeoutMs?: number;
}
export declare function createArnikoClient(opts?: ArnikoClientOptions): {
    isAvailable(): Promise<boolean>;
    scanCode(code: string, taskId?: string): Promise<ScanResult>;
    scanPath(path: string, scanOpts?: {
        tools?: string[];
    }): Promise<ScanResult>;
    scanDiff(diffPath: string, diffOpts?: {
        tools?: string[];
    }): Promise<ScanResult>;
    bootstrap(composePath: string): Promise<{
        started: boolean;
        message: string;
    }>;
    summarise(result: ScanResult): string;
};
export type ArnikoClient = ReturnType<typeof createArnikoClient>;
