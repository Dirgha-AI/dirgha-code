/**
 * Model family-aware fallback — ported from monorepo agent/model-fallback.ts.
 *
 * When a model from provider A fails, try the same model family
 * on another provider before generic cross-provider fallback.
 */
import type { ProviderId } from "./dispatch.js";
export declare function detectFamily(modelId: string): string | null;
export declare function familyAlternatives(modelId: string, excludeProvider?: ProviderId): Array<{
    provider: ProviderId;
    model: string;
}>;
