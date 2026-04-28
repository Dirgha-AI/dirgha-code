/**
 * Full-width modal overlay showing every available slash command plus
 * the TUI keyboard shortcuts.
 *
 * The command list is supplied as props so the caller decides whether
 * to feed it the built-in catalogue, the live `SlashRegistry.names()`
 * output, or a test-only stub. Shortcuts live here (they're TUI state,
 * not slash state).
 *
 * Navigation: type-to-filter, arrow keys or j/k to scroll, Esc / q to
 * close. Pure presentational; the parent owns visibility.
 */
import * as React from 'react';
export interface HelpSlashCommand {
    name: string;
    description: string;
    aliases?: string[];
    group?: string;
}
export interface HelpOverlayProps {
    slashCommands: HelpSlashCommand[];
    onClose: () => void;
}
export declare function HelpOverlay(props: HelpOverlayProps): React.JSX.Element;
