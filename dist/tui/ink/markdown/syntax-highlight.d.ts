/**
 * Syntax highlighting for tool result output (e.g. fs_read of code files).
 *
 * When the agent reads a code file via fs_read, the raw output is
 * tokenized and can be rendered with appropriate theme colours.
 */
import type { Palette } from "../../theme.js";
import type { Token, TokenKind } from "./langs/types.js";
export declare function extensionFromArgSummary(argSummary: string): string | null;
export declare function isCodeFile(argSummary: string): boolean;
export declare function highlightContent(content: string, argSummary: string): Token[];
export declare function colorForKind(kind: TokenKind, palette: Palette): string;
export type { Token, TokenKind } from "./langs/types.js";
