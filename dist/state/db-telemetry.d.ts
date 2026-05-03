/**
 * DB write telemetry.
 *
 * Tracks SQLite write failures so they are not silently swallowed.
 * Stores counts in ~/.dirgha/state.json under `dbErrors`. When 10+
 * errors accumulate in a single process lifetime, a warning is
 * written to stderr so the user knows session data may not persist.
 */
interface DbTelemetryData {
    totalWrites: number;
    failedWrites: number;
    lastError: string;
    lastErrorTime: string;
}
export declare function recordDbError(err: unknown): void;
export declare function recordDbSuccess(): void;
export declare function getDbErrorCount(): number;
export declare function getDbTelemetry(): Readonly<DbTelemetryData>;
export declare function flushDbTelemetry(): Promise<void>;
export declare function loadDbTelemetry(): Promise<void>;
export {};
