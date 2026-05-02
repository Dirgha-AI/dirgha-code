/**
 * Directory listing, one level deep. Emits a terse `kind name [size]`
 * table so the model has a clear picture of directory contents without
 * spending tokens on noisy metadata.
 */
import type { Tool } from "./registry.js";
export declare const fsLsTool: Tool;
