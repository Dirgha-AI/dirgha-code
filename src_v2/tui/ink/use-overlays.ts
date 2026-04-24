/**
 * Overlay + input-assist state hook for the Ink root component.
 *
 * Owns the four overlay channels (model picker, help, @-file completion)
 * plus the `@` query and any other state that would otherwise bloat
 * App.tsx. Extracted so App stays under 500 LOC as the feature surface
 * grew (model picker, help, vim mode, paste-collapse, at-file complete).
 */

import * as React from 'react';

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

export function useOverlays(): OverlayApi {
  const [active, setActive] = React.useState<OverlayKind>(null);
  const [atQuery, setAtQuery] = React.useState<string | null>(null);

  // Keep the @-file overlay in sync with the input token.
  React.useEffect(() => {
    if (atQuery === null) {
      if (active === 'atfile') setActive(null);
      return;
    }
    if (active === null) setActive('atfile');
  }, [atQuery, active]);

  const openOverlay = React.useCallback((k: 'models' | 'help'): void => {
    setActive(k);
  }, []);

  const closeOverlay = React.useCallback((): void => {
    setActive(null);
    setAtQuery(null);
  }, []);

  const spliceAtSelection = React.useCallback((value: string, selected: string): string => {
    const idx = value.lastIndexOf('@');
    if (idx === -1) return value;
    // Replace `@query` (up to next whitespace or end) with the path.
    let end = idx + 1;
    while (end < value.length && !/\s/.test(value[end] ?? '')) end += 1;
    return `${value.slice(0, idx)}@${selected}${value.slice(end)}`;
  }, []);

  return {
    active,
    setActive,
    atQuery,
    setAtQuery,
    openOverlay,
    closeOverlay,
    spliceAtSelection,
  };
}
