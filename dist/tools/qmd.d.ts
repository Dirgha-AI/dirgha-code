/**
 * qmd tool — semantic search over markdown document collections.
 *
 * Resolution order:
 *   1. Vendored binary at vendor/qmd/<platform>/qmd (built from Dirgha-AI/qmd fork)
 *   2. PATH binary `qmd` (user-installed @tobilu/qmd via Bun)
 *   3. null → return informative error
 *
 * The @tobilu/qmd package is TypeScript-source-only and requires Bun, so we
 * always use the CLI subprocess path — no dynamic JS import attempted.
 *
 * Build vendored binary: bun build --compile --target=bun-linux-x64 ./src/cli.ts --outfile vendor/qmd/linux-x64/qmd
 */
import type { Tool } from "./registry.js";
export declare const qmdTool: Tool;
