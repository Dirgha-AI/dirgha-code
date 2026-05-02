/**
 * Connected-border tool group — gemini-cli pattern.
 *
 * Wraps a sequence of consecutive tool calls of one assistant turn in
 * ONE bordered region (instead of dirgha's old "round box per call").
 * The bracket reads as a single visual unit; individual tool rows
 * stack inside without their own borders.
 *
 * Compact (dense) tools render as flush single lines with no border
 * chrome — they break out of the bracket the same way gemini's
 * DenseToolMessage does. Heavy tools (shell, write, agent) render
 * with name + arg summary at the top, output preview below, all
 * inside the connected region.
 */
import * as React from "react";
import type { ToolStatus } from "./ToolBox.js";
export interface ToolItem {
    id: string;
    name: string;
    status: ToolStatus;
    argSummary: string;
    outputPreview: string;
    outputKind?: "text" | "diff";
    startedAt: number;
    durationMs?: number;
}
export interface ToolGroupProps {
    tools: ToolItem[];
}
export declare const ToolGroup: React.NamedExoticComponent<ToolGroupProps>;
