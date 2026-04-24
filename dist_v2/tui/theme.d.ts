/**
 * ANSI colour tokens. Scoped to what the TUI actually uses — no
 * overreach into a full style system. Callers wrap strings via style().
 */
export interface Theme {
    userPrompt: string;
    assistant: string;
    thinking: string;
    tool: string;
    toolError: string;
    systemNotice: string;
    muted: string;
    accent: string;
    warning: string;
    danger: string;
    success: string;
}
export declare const defaultTheme: Theme;
export declare function style(token: string, text: string): string;
export declare function styleDim(text: string): string;
export declare function noColour(): Theme;
