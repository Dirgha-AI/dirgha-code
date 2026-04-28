/**
 * Overlay + input-assist state hook for the Ink root component.
 *
 * Owns the four overlay channels (model picker, help, @-file completion)
 * plus the `@` query and any other state that would otherwise bloat
 * App.tsx. Extracted so App stays under 500 LOC as the feature surface
 * grew (model picker, help, vim mode, paste-collapse, at-file complete).
 */

import * as React from 'react';

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

export function useOverlays(): OverlayApi {
  const [active, setActive] = React.useState<OverlayKind>(null);
  const [atQuery, setAtQuery] = React.useState<string | null>(null);
  const [slashQuery, setSlashQuery] = React.useState<string | null>(null);

  // Keep the @-file overlay in sync with the input token.
  React.useEffect(() => {
    if (atQuery === null) {
      if (active === 'atfile') setActive(null);
      return;
    }
    if (active === null || active === 'slash') setActive('atfile');
  }, [atQuery, active]);

  // Keep the slash overlay in sync with the input token.
  React.useEffect(() => {
    if (slashQuery === null) {
      if (active === 'slash') setActive(null);
      return;
    }
    if (active === null) setActive('slash');
  }, [slashQuery, active]);

  const openOverlay = React.useCallback((k: 'models' | 'help' | 'theme'): void => {
    setActive(k);
  }, []);

  const closeOverlay = React.useCallback((): void => {
    setActive(null);
    setAtQuery(null);
    setSlashQuery(null);
  }, []);

  const spliceAtSelection = React.useCallback((value: string, selected: string): string => {
    const idx = value.lastIndexOf('@');
    if (idx === -1) return value;
    // Replace `@query` (up to next whitespace or end) with the path.
    let end = idx + 1;
    while (end < value.length && !/\s/.test(value[end] ?? '')) end += 1;
    return `${value.slice(0, idx)}@${selected}${value.slice(end)}`;
  }, []);

  const spliceSlashSelection = React.useCallback((value: string, selected: string): string => {
    if (!value.startsWith('/')) return `/${selected}`;
    // Replace `/query` up to first whitespace; preserve the tail.
    let end = 1;
    while (end < value.length && !/\s/.test(value[end] ?? '')) end += 1;
    return `/${selected}${value.slice(end)}`;
  }, []);

  return {
    active,
    setActive,
    atQuery,
    setAtQuery,
    slashQuery,
    setSlashQuery,
    openOverlay,
    closeOverlay,
    spliceAtSelection,
    spliceSlashSelection,
  };
}
