/**
 * Overlay + input-assist state hook for the Ink root component.
 *
 * Owns the four overlay channels (model picker, help, @-file completion)
 * plus the `@` query and any other state that would otherwise bloat
 * App.tsx. Extracted so App stays under 500 LOC as the feature surface
 * grew (model picker, help, vim mode, paste-collapse, at-file complete).
 */
export type OverlayKind = 'models' | 'help' | 'atfile' | null;
export interface OverlayApi {
    active: OverlayKind;
    setActive: (k: OverlayKind) => void;
    atQuery: string | null;
    setAtQuery: (q: string | null) => void;
    openOverlay: (k: 'models' | 'help') => void;
    closeOverlay: () => void;
    /**
     * Splice a selected @-file path back into `value`, replacing the
     * trailing @-token. Returns the new buffer — callers must pipe this
     * into their setInput hook.
     */
    spliceAtSelection: (value: string, selected: string) => string;
}
export declare function useOverlays(): OverlayApi;
