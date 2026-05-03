/**
 * NVIDIA NIM model catalogue — source of truth for all NIM-hosted models.
 *
 * thinkingMode semantics:
 *   "none"       — model has no reasoning/thinking feature
 *   "always-on"  — model always thinks (kimi-k2-thinking)
 *   "default-on" — model thinks by default; we DISABLE it via thinkingParam (kimi-k2.6, qwen3.5)
 *   "opt-in"     — thinking off by default; caller must pass thinkingParam to enable
 */
export interface NimModel {
    id: string;
    label: string;
    family: string;
    contextWindow: number;
    maxOutputTokens: number;
    tools: boolean;
    vision: boolean;
    thinkingMode: "none" | "always-on" | "default-on" | "opt-in";
    /** Params to merge into the NIM request body for thinking control.
     *  For "default-on" models this DISABLES thinking (bug workaround).
     *  For "opt-in" models this ENABLES thinking. null = no injection needed. */
    thinkingParam: Record<string, unknown> | null;
    defaultModel?: boolean;
    tags: string[];
    notes?: string;
}
export declare const NIM_CATALOGUE: NimModel[];
export declare const NIM_DEFAULT: NimModel;
export declare const NIM_BY_ID: Map<string, NimModel>;
/** Model IDs deprecated/removed from NIM — never route to these. */
export declare const NIM_DEPRECATED: Set<string>;
