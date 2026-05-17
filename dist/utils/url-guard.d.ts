/**
 * URL safety guard for SSRF prevention.
 *
 * Blocks HTTP requests to private / loopback / link-local / metadata
 * addresses unless the user explicitly opts out via
 * `DIRGHA_ALLOW_PRIVATE_FETCH=1`.
 *
 * Only checks literal hostnames and IP strings — no DNS resolution
 * (sync, dependency-free).
 */
/**
 * Throw if `url` resolves to a private / loopback / link-local / metadata
 * address. Checks the literal hostname only (no DNS). Opt out with
 * DIRGHA_ALLOW_PRIVATE_FETCH=1.
 *
 * @throws Error if the URL targets a blocked address.
 */
export declare function assertSafeFetchUrl(url: string): void;
