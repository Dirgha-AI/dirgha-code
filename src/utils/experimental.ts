/**
 * Feature flag for in-development command surfaces. Experimental commands
 * compile and register, but are hidden from the default `--help` listing
 * and refuse to run unless DIRGHA_EXPERIMENTAL=1 is set.
 *
 * This keeps aspirational features (mesh, DAO, marketplace, agent swarm,
 * Bucky labor network) visible to internal builds while public users see
 * only the stable surface.
 */

export function isExperimentalEnabled(): boolean {
  const raw = process.env['DIRGHA_EXPERIMENTAL'];
  return raw === '1' || raw === 'true';
}

/**
 * Register an experimental command only when the feature flag is set.
 * Call signature mirrors the existing `register*(program)` pattern so
 * wiring is a one-line swap at the call site.
 */
export function registerIfExperimental(
  name: string,
  register: () => void,
): void {
  if (isExperimentalEnabled()) register();
}
