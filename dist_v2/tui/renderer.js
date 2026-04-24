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
import { defaultTheme, noColour, style } from './theme.js';
export function renderStreamingEvents(opts = {}) {
    const theme = opts.colour === false ? noColour() : opts.theme ?? defaultTheme;
    const write = opts.write ?? ((chunk) => { process.stdout.write(chunk); });
    const showThinking = opts.showThinking ?? false;
    let thinkingBannerOpen = false;
    return (event) => {
        switch (event.type) {
            case 'text_start':
                thinkingBannerOpen && write('\n');
                thinkingBannerOpen = false;
                return;
            case 'text_delta':
                write(event.delta);
                return;
            case 'text_end':
                return;
            case 'thinking_start':
                if (showThinking) {
                    thinkingBannerOpen = true;
                    write(style(theme.thinking, '\n• thinking… '));
                }
                return;
            case 'thinking_delta':
                if (showThinking)
                    write(style(theme.thinking, event.delta));
                return;
            case 'thinking_end':
                if (showThinking && thinkingBannerOpen) {
                    thinkingBannerOpen = false;
                    write('\n');
                }
                return;
            case 'tool_exec_start':
                write(style(theme.tool, `\n→ ${event.name}`));
                return;
            case 'tool_exec_end': {
                const token = event.isError ? theme.toolError : theme.tool;
                const verdict = event.isError ? 'error' : 'done';
                write(style(token, ` (${verdict}, ${event.durationMs}ms)\n`));
                return;
            }
            case 'error':
                write(style(theme.danger, `\n[error] ${event.message}\n`));
                return;
            case 'turn_end':
                write('\n');
                return;
            case 'agent_end':
                return;
        }
    };
}
//# sourceMappingURL=renderer.js.map