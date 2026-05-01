/**
 * Smart router: chooses a cheap model for short, non-code questions
 * and the default model otherwise. Heuristic-driven; deterministic and
 * cheap enough to run per turn.
 */
import type { Message } from "../kernel/types.js";
import type { ProviderId } from "../providers/dispatch.js";
export interface SmartRouterConfig {
    enabled: boolean;
    cheapModel: string;
    defaultModel: string;
    maxCheapChars?: number;
    maxCheapWords?: number;
    candidateProviders?: ProviderId[];
}
export interface RouteDecision {
    model: string;
    reason: string;
}
export interface SmartRouter {
    route(messages: Message[]): RouteDecision;
}
export declare function createSmartRouter(cfg: SmartRouterConfig): SmartRouter;
