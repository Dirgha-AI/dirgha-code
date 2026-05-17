/**
 * URL safety guard for SSRF prevention.
 *
 * Blocks HTTP requests to private / loopback / link-local / metadata
 * addresses unless the user explicitly opts out via
 * `DIRGHA_ALLOW_PRIVATE_FETCH=1`.
 *
 * `assertSafeFetchUrl` — sync literal-IP fast path.
 * `assertSafeFetchUrlAsync` — async variant that also resolves the
 * hostname via DNS and checks every resolved address against the same
 * private/loopback/link-local/RFC1918 blocks (DNS-rebind defence).
 */
/**
 * Throw if `url` resolves to a private / loopback / link-local / metadata
 * address. Checks the literal hostname only (no DNS). Opt out with
 * DIRGHA_ALLOW_PRIVATE_FETCH=1.
 *
 * @throws Error if the URL targets a blocked address.
 */
export declare function assertSafeFetchUrl(url: string): void;
/**
 * Async variant that additionally resolves the hostname via DNS and
 * re-runs the private/loopback/link-local/RFC1918 IP checks against
 * EVERY resolved address. Rejects if any resolved address is private.
 *
 * Callers MUST also use `redirect: 'manual'` on their fetch call, OR
 * re-validate the final URL after redirects — otherwise a 301 to a
 * private address can bypass this guard.
 *
 * @throws Error if the URL or any resolved address targets a blocked address.
 */
export declare function assertSafeFetchUrlAsync(url: string): Promise<void>;
