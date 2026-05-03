/**
 * Tracks declined update versions in ~/.dirgha/state.json so the
 * update banner doesn't re-prompt for versions the user already saw
 * and dismissed.
 */
export interface DeclinedVersionsApi {
    /** Check whether a given version was previously declined. */
    isDeclined(version: string): boolean;
    /** Persist a declined version so it won't be re-prompted. */
    decline(version: string): void;
    /** Load the set of declined versions (async, for initial render). */
    loadDeclined(): Promise<Set<string>>;
}
export declare function useDeclinedVersions(): DeclinedVersionsApi;
