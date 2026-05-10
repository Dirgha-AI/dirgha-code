/**
 * Dense (compact) tool-call render.
 *
 * For high-frequency tools where the output is "look at me" rather than
 * "stop and read me" — fs_read, search_grep, search_glob, fs_ls, fs_edit.
 * Renders as a SINGLE indented line with no border:
 *
 *   ✓ Read   src/tui/theme.ts                  42ms
 *   ✓ Grep   "borderStyle"  src/tui/ink/...    18ms  3 matches
 *   ✗ Edit   src/cli/config.ts                  2ms  permission denied
 *
 * Sits flush with surrounding `<ToolGroup>` rows (no own border) so the
 * group's outer bracket reads as one continuous block.
 */
import * as React from "react";
import type { ToolStatus } from "./ToolBox.js";
export interface DenseToolMessageProps {
    name: string;
    status: ToolStatus;
    argSummary?: string;
    outputPreview?: string;
    durationMs?: number;
    startedAt?: number;
}
export declare const DenseToolMessage: React.NamedExoticComponent<DenseToolMessageProps>;
export declare function isDenseTool(name: string): boolean;
