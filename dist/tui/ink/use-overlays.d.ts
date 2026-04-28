/**
 * Overlay + input-assist state hook for the Ink root component.
 *
 * Owns the four overlay channels (model picker, help, @-file completion)
 * plus the `@` query and any other state that would otherwise bloat
 * App.tsx. Extracted so App stays under 500 LOC as the feature surface
 * grew (model picker, help, vim mode, paste-collapse, at-file complete).
 */
export type OverlayKind = 'models' | 'help' | 'atfile' | 'slash' | 'theme' | null;
export interface OverlayApi {
    active: OverlayKind;
    setActive: (k: OverlayKind) => void;
    atQuery: string | null;
    setAtQuery: (q: string | null) => void;
    slashQuery: string | null;
    setSlashQuery: (q: string | null) => void;
    openOverlay: (k: 'models' | 'help' | 'theme') => void;
    closeOverlay: () => void;
    /**
     * Splice a selected @-file path back into `value`, replacing the
     * trailing @-token. Returns the new buffer — callers must pipe this
     * into their setInput hook.
     */
    spliceAtSelection: (value: string, selected: string) => string;
    /**
     * Replace the leading `/<query>` segment with `/<selected>`. The
     * remainder of the buffer (anything after the first whitespace) is
     * preserved so a partially-typed argument tail survives autocomplete.
     */
    spliceSlashSelection: (value: string, selected: string) => string;
}
export declare function useOverlays(): OverlayApi;
