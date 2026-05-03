/**
 * React context for sharing the active hex-colour palette with Ink
 * components.  The provider resolves a Palette from the theme name
 * supplied by the caller (usually the application root).
 */

import React, { createContext, useContext } from 'react';
import type { Palette, ThemeName } from '../theme.js';
import { paletteFor } from '../theme.js';

interface ThemeContextValue {
  palette: Palette;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette: paletteFor('readable'),
});

interface ThemeProviderProps {
  activeTheme: ThemeName;
  children: React.ReactNode;
}

export function ThemeProvider({ activeTheme, children }: ThemeProviderProps): React.ReactElement {
  // Stable object references — avoids re-rendering every useTheme() consumer
  // (including Logo inside <Static>) on each App re-render.
  const palette = React.useMemo(() => paletteFor(activeTheme), [activeTheme]);
  const value = React.useMemo(() => ({ palette }), [palette]);
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Palette {
  const ctx = useContext(ThemeContext);
  return ctx.palette;
}
