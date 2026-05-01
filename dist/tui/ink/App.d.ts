/**
 * Ink root component for the dirgha TUI.
 *
 * Layout is a single vertical stack:
 *   1. Logo (rendered once inside <Static>, never re-renders)
 *   2. Transcript (finalised user messages + completed turn blocks)
 *   3. LiveTurn (the currently streaming turn, if any)
 *   4. InputBox
 *   5. StatusBar
 *   6. Optional overlay (ModelPicker / HelpOverlay / AtFileComplete)
 *
 * Event → transcript projection lives in `use-event-projection.ts`;
 * overlay state lives in `use-overlays.ts`. This component stays
 * focused on layout and lifecycle.
 */
import * as React from "react";
import type { Message } from "../../kernel/types.js";
import type { EventStream } from "../../kernel/event-stream.js";
import type { ProviderRegistry } from "../../providers/index.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { SessionStore } from "../../context/session.js";
import type { DirghaConfig } from "../../cli/config.js";
import type { SlashRegistry } from "../../cli/slash.js";
import { type ModelEntry } from "./components/ModelPicker.js";
import { type HelpSlashCommand } from "./components/HelpOverlay.js";
export interface AppProps {
    events: EventStream;
    registry: ToolRegistry;
    providers: ProviderRegistry;
    sessions: SessionStore;
    config: DirghaConfig;
    cwd: string;
    systemPrompt?: string;
    initialMessages?: Message[];
    /** Slash commands to render in the help overlay. Defaults to []. */
    slashCommands?: HelpSlashCommand[];
    /** Model catalogue. Defaults to the prices registry. */
    models?: ModelEntry[];
    /** Slash registry — built by runInkTUI, dispatched on submit. */
    slashRegistry: SlashRegistry;
    /** Cross-session memory/ledger context injected into system prompt. */
    ledgerContext?: string;
}
export declare function App(props: AppProps): React.JSX.Element;
