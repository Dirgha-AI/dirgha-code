/**
 * Code search using ripgrep when available, with a conservative fallback
 * to a Node-native line scan. Always returns file:line:match triples,
 * capped by resultLimit to keep the LLM reply compact.
 */
import type { Tool } from './registry.js';
export declare const searchGrepTool: Tool;
