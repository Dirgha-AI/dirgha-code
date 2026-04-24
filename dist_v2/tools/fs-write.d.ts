/**
 * Write a file to disk, creating parent directories as needed.
 * Returns a unified diff summary so the approval UI can preview the
 * change. Refuses to silently overwrite: the description declares the
 * overwrite contract.
 */
import type { Tool } from './registry.js';
export declare const fsWriteTool: Tool;
