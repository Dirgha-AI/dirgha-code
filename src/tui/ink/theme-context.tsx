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
  const palette = paletteFor(activeTheme);
  return (
    <ThemeContext.Provider value={{ palette }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Palette {
  const ctx = useContext(ThemeContext);
  return ctx.palette;
}
