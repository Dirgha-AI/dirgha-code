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

export interface ModelDescriptor {
  id: string;
  label: string;
  family: string;
  contextWindow: number;
  maxOutputTokens: number;
  tools: boolean;
  vision: boolean;
  thinkingMode: "none" | "always-on" | "default-on" | "opt-in";
  /** Params to merge into the request body for thinking control.
   *  null = no injection needed. */
  thinkingParam: Record<string, unknown> | null;
  inputPerM: number;
  outputPerM: number;
  cachedInputPerM?: number;
  defaultModel?: boolean;
  deprecated?: boolean;
  replacedBy?: string;
  notes?: string;
  tags: string[];
}

export function makeIndex(catalogue: ModelDescriptor[]): Map<string, ModelDescriptor> {
  return new Map(catalogue.map(m => [m.id, m]));
}

export function defaultModel(catalogue: ModelDescriptor[]): ModelDescriptor {
  return catalogue.find(m => m.defaultModel) ?? catalogue[0];
}

export function activeModels(catalogue: ModelDescriptor[]): ModelDescriptor[] {
  return catalogue.filter(m => !m.deprecated);
}
