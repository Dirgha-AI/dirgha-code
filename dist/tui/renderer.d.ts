/**
 * Streaming renderer.
 *
 * The v1 implementation is line-buffered rather than a full cell-level
 * differential renderer: it writes assistant text deltas directly to
 * stdout, emits newline-separated tool invocation banners, and prefixes
 * status changes with ANSI-coloured tokens. It is intentionally simple
 * and terminal-safe; a higher-fidelity differential renderer can be
 * layered in later without changing this module's interface.
 */
import type { AgentEvent } from '../kernel/types.js';
import { type Theme } from './theme.js';
export interface StreamRendererOptions {
    theme?: Theme;
    colour?: boolean;
    showThinking?: boolean;
    write?: (chunk: string) => void;
}
export declare function renderStreamingEvents(opts?: StreamRendererOptions): (event: AgentEvent) => void;
