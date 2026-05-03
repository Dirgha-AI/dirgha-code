/**
 * GitHub client tool.
 *
 * Wraps the `gh` CLI for common GitHub operations: creating / listing PRs,
 * creating / listing issues, and viewing repo info. Every action returns
 * structured JSON so the model can act on specific fields without parsing
 * plain text.
 *
 * Requires the `gh` CLI to be installed and authenticated. The tool checks
 * for the binary at call time and returns a clear error when it is absent.
 */
import type { Tool } from "./registry.js";
export declare const githubTool: Tool;
