/**
 * File discovery by glob pattern. Honours .gitignore-style directory
 * skips (node_modules, .git, dist by default). Returns matching paths
 * relative to the search root, sorted for determinism.
 */
import type { Tool } from "./registry.js";
export declare const searchGlobTool: Tool;
