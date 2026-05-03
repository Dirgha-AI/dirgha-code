/**
 * Shared ModelDescriptor interface and utility helpers.
 * Every per-provider catalogue implements this shape.
 *
 * thinkingMode semantics:
 *   "none"       — model has no reasoning/thinking feature
 *   "always-on"  — model always thinks (deepseek-r1, o3)
 *   "default-on" — model thinks by default; thinkingParam DISABLES it
 *   "opt-in"     — thinking off by default; thinkingParam ENABLES it
 */
export function makeIndex(catalogue) {
    return new Map(catalogue.map(m => [m.id, m]));
}
export function defaultModel(catalogue) {
    return catalogue.find(m => m.defaultModel) ?? catalogue[0];
}
export function activeModels(catalogue) {
    return catalogue.filter(m => !m.deprecated);
}
//# sourceMappingURL=catalogue.js.map