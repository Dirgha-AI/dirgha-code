/**
 * Tarball builder used by `dirgha deploy`. Produces a gzipped tar of
 * the cwd while honouring .gitignore + .dirghaignore and skipping
 * heavy-weight build artifacts. Caps total size at 500 MB.
 */
export interface TarballResult {
    path: string;
    sizeBytes: number;
}
export declare function buildTarball(cwd: string, extraExcludes?: string[]): Promise<TarballResult>;
